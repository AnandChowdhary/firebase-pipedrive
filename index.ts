import axios from "axios";
import {
  initializeApp,
  credential,
  ServiceAccount,
  firestore,
} from "firebase-admin";
import { config } from "dotenv";
import ElasticSearch from "@elastic/elasticsearch";
import AWS, { ElastiCache } from "aws-sdk";
const createAwsElasticsearchConnector = require("aws-elasticsearch-connector");
config();

const FIREBASE_SERVICE_ACCOUNT_KEY: ServiceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? ""
);
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const API_KEY = process.env.API_KEY;
const BASE_URL = "https://koj.pipedrive.com/api/v1";

const api = axios.create({
  baseURL: BASE_URL,
});

initializeApp({
  credential: credential.cert(FIREBASE_SERVICE_ACCOUNT_KEY),
  databaseURL: FIREBASE_DATABASE_URL,
});
const subscribers = firestore().collection("subscribers-v2");

const awsConfig = new AWS.Config({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});
const client = new ElasticSearch.Client({
  ...createAwsElasticsearchConnector(awsConfig),
  node: `https://${process.env.AWS_ELASTIC_HOST}`,
});

enum CustomFields {
  ELASTICSEARCH_USER_ID = "57bdc336b1fb99fc9447c89cb21870fe4a032291",
  FIREBASE_RECORD_ID = "b4b22c726c33517f3810d338d77c567c8b358da4",
  REFERRER_SOURCE = "2d708892b623a93d35eb649f4c730f61107c3125",
  REFERRER_VALUE = "2802445329546a203d238d3620827551ebc53105",
  UTM_CAMPAIGN = "91775aa4b6296a3582586c38955b837166b1dfb1",
  UTM_MEDIUM = "2359203a503209c865119c28dac11de5c3ebf251",
  UTM_SOURCE = "a9d761a6c3cdba4bfa305c5f41c396ef1be3872b",
}

interface Person {
  name: string;
  email: string[];
  phone?: string[];
}

interface Lead {
  title: string;
  note?: string;
  person_id?: number;
  value?: string;
  currency?: string;
  expected_close_date?: string;
  "239af2d22f89a6cce027a246134066f69bbd80ad"?: number;
  "239af2d22f89a6cce027a246134066f69bbd80ad_currency"?: string;
}

const capitalize = (str: string) =>
  str ? str.charAt(0).toUpperCase() + str.slice(1) : "";

export const addPerson = async (
  person: Person
): Promise<{
  data: {
    id: number;
  };
}> => {
  const { data } = await api.post(`/persons?api_token=${API_KEY}`, person);
  console.log("Added user", person.name);
  return data;
};

export const addNote = async (
  content: string,
  deal_id: string
): Promise<{
  data: {
    id: number;
  };
}> => {
  const { data } = await api.post(`/notes?api_token=${API_KEY}`, {
    content,
    deal_id,
  });
  console.log("Added note", deal_id);
  return data;
};

export const addLead = async (lead: Lead) => {
  try {
    const { data } = await api.post(`/deals?api_token=${API_KEY}`, lead);
    console.log("Added lead", lead.title);
    return data;
  } catch (error) {
    console.log(error);
  }
};

const sent: string[] = [];
const migrateLiveLeads = async () => {
  for await (const item of [subscribers]) {
    const docs = await item.get();
    docs.forEach((doc) => sent.push(doc.id));
  }
  console.log("Listening...");
  [subscribers].forEach((item) => {
    item.onSnapshot((snapshot) => {
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (doc.id && !sent.includes(doc.id) && data.email && !data.dev) {
          sent.push(doc.id);
          return console.log(JSON.stringify(data));
          firebaseToPipedrive(data);
        }
      });
    });
  });
};

const firebaseToPipedrive = async (data?: firestore.DocumentData) => {
  if (data && data.email && !data.dev) {
    console.log("Sending record for", data.email);
    const person = await addPerson({
      name: data.name,
      email: [data.email],
      phone: [data.phone],
    });
    const lead = await addLead({
      person_id: person.data.id,
      title: `${capitalize(data.name.split(" ")[0])}'s${
        data.numberOfRooms ? ` ${data.numberOfRooms}-room` : ""
      } ${
        data.locationName
          ? `${capitalize(data.locationName.split(" ")[0])} apartment`
          : "apartment"
      }`,
    });
    if (lead?.data?.id) {
      await addNote(
        `<p><strong>Onboarding responses</strong></p><ul>${Object.keys(data)
          .map(
            (key) =>
              `<li><strong>${capitalize(
                key.replace(/([A-Z])/g, " $1")
              )}</strong>: ${
                typeof data[key] === "object"
                  ? data[key]._seconds
                    ? new Date(
                        data[key]._seconds * 1000
                      ).toLocaleString("en-CH", { timeZone: "Europe/Zurich" })
                    : `<code>${JSON.stringify(data[key])}</code>`
                  : data[key]
              }</li>`
          )
          .join("")}</ul>`,
        lead.data.id
      );
      if (data?.userId) {
        const elasticData = await getElasticSearchData(data.userId);
        let text = "";
        if (elasticData?._source.page_url_pathname_lang)
          text += "\n- language: " + elasticData._source.page_url_pathname_lang;
        if (elasticData?._source.location_subdivisions_0_names_en)
          text +=
            "\n- subdivision: " +
            elasticData._source.location_subdivisions_0_names_en;
        if (elasticData?._source.location_country_names_en)
          text +=
            "\n- country: " + elasticData._source.location_country_names_en;
        if (elasticData?._source.location_city_names_en)
          text += "\n- city: " + elasticData._source.location_city_names_en;
        if (elasticData?._source.user_agent_os_name)
          text += "\n- os: " + elasticData._source.user_agent_os_name;
        if (elasticData?._source.user_agent_browser_name)
          text += "\n- browser: " + elasticData._source.user_agent_browser_name;
        await addNote(text, lead.data.id);
      }
    }
  }
};

const migratePreviousLeads = async () => {
  console.log("Migrating previous leads...");
  for await (const item of [subscribers]) {
    const docs = await item.get();
    const ids: string[] = [];
    docs.forEach((doc) => ids.push(doc.id));
    for await (const id of ids) {
      const data = (await item.doc(id).get()).data();
      await firebaseToPipedrive(data);
    }
  }
};

const getElasticSearchData = async (
  userId: string
): Promise<
  | {
      _source: {
        page_url_pathname_lang?: string;
        location_subdivisions_0_names_en?: string;
        location_country_names_en?: string;
        location_city_names_en?: string;
        user_agent_os_name?: string;
        user_agent_browser_name?: string;
      };
    }
  | undefined
> => {
  const data = await client.search({
    index: "analytics-website",
    size: 1,
    body: {
      sort: "date",
      query: {
        match: { user_id: userId },
      },
    },
  });
  const items = (((data || {}).body || {}).hits || {}).hits || [];
  if (items.length) return items[0];
};

migratePreviousLeads();
// migrateLiveLeads();
