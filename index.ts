import axios from "axios";
import {
  initializeApp,
  credential,
  ServiceAccount,
  firestore,
} from "firebase-admin";
import { config } from "dotenv";
import dayjs from "dayjs";
import ElasticSearch from "@elastic/elasticsearch";
import Phone from "awesome-phonenumber";
import AWS from "aws-sdk";
import { Client, PlaceInputType } from "@googlemaps/google-maps-services-js";
const createAwsElasticsearchConnector = require("aws-elasticsearch-connector");
config();

const FIREBASE_SERVICE_ACCOUNT_KEY: ServiceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY || ""
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

const maps = new Client();

enum CustomFields {
  ELASTICSEARCH_USER_ID = "57bdc336b1fb99fc9447c89cb21870fe4a032291",
  FIREBASE_RECORD_ID = "b4b22c726c33517f3810d338d77c567c8b358da4",
  REFERRER_SOURCE = "2d708892b623a93d35eb649f4c730f61107c3125",
  UTM_CAMPAIGN = "91775aa4b6296a3582586c38955b837166b1dfb1",
  UTM_MEDIUM = "2359203a503209c865119c28dac11de5c3ebf251",
  UTM_SOURCE = "a9d761a6c3cdba4bfa305c5f41c396ef1be3872b",
  CORRESPONDING_LANGUAGE = "920a0bf973820c90cf4fe0b603c918c976b43c26",
  RENTAL_PERIOD = "75af5cfb9d97974ef58950f1bb61c3702f85275a",
  MONTHLY_BUDGET = "04a0826dfb0cad877b2c59f272f564165b9fcdb4",
  MOVING_IN_DAY = "b651525abe76ac99182fe5915ca977b30b06fd9e",
  LOCATION = "71a278100c9c77860b8a3394dbc084c3492af995",
}
enum Labels {
  ON_FIRE = 23,
  COLD = 24,
  MILD = 26,
  HOT = 25,
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
}

/**
 * Capitalize the first letter of a string
 */
export const capitalizeFirstLetter = (string: string) =>
  string.charAt(0).toUpperCase() + string.toLowerCase().slice(1);

/**
 * Capitalize the first letter of each word in a string
 */
export const capitalizeFirstAndLastLetter = (string: string) => {
  const words = string.split(" ");
  words[0] = capitalizeFirstLetter(words[0]);
  words[words.length - 1] = capitalizeFirstLetter(words[words.length - 1]);
  return words.join(" ");
};

const languageName = (key: string) => (key === "de" ? "German" : "English");

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

export const addSubscription = async (lead: {
  deal_id: string;
  currency: string;
  cadence_type: "weekly" | "monthly" | "quarterly" | "yearly";
  cycles_count: number;
  cycle_amount: number;
  start_date: string;
  payments: Array<{ amount: number }>;
}) => {
  try {
    const { data } = await api.post(
      `/subscriptions/recurring?api_token=${API_KEY}`,
      lead
    );
    console.log("Added subscription");
    return data;
  } catch (error) {
    console.log(error);
  }
};

export const getLead = async (id: string) => {
  return (await api.get(`/deals/${id}?api_token=${API_KEY}`)).data as any;
};

export const updateLead = async (id: string, data: any) => {
  await api.put(`/deals/${id}?api_token=${API_KEY}`, data);
  console.log("Updated lead", id);
};

export const updatePerson = async (id: number, data: any) => {
  await api.put(`/persons/${id}?api_token=${API_KEY}`, data);
  console.log("Updated person", id);
};

const getMapsData = async (location: string) => {
  console.log("Fetching Google Maps", location);
  const details = (
    await maps.findPlaceFromText({
      params: {
        key: process.env.MAPS_API_KEY ?? "",
        input: location,
        inputtype: PlaceInputType.textQuery,
      },
    })
  ).data.candidates[0];
  if (details?.place_id)
    return (
      await maps.placeDetails({
        params: {
          key: process.env.MAPS_API_KEY ?? "",
          place_id: details.place_id,
        },
      })
    ).data.result;
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
          firebaseToPipedrive(data, doc.id);
        }
      });
    });
  });
};

const firebaseToPipedrive = async (
  data?: firestore.DocumentData,
  firebaseId?: string
) => {
  if (data && data.email && !data.dev) {
    console.log("Sending record for", data.email);
    const person = await addPerson({
      name: capitalizeFirstAndLastLetter(data.name),
      email: [data.email.toLowerCase()],
      phone: data.phone
        ? [new Phone(data.phone, "CH").getNumber("international")]
        : undefined,
    });
    const lead = await addLead({
      person_id: person.data.id,
      title: `${capitalizeFirstLetter(data.name.split(" ")[0])}'s${
        data.numberOfRooms ? ` ${data.numberOfRooms}-room` : ""
      } ${
        data.locationName
          ? `${capitalizeFirstLetter(
              data.locationName.split(" ")[0]
            )} apartment`
          : "apartment"
      }`,
      value: ((data.budget || 0) * 12 * (data.period || 1)).toString(),
      currency: "GI_",
    });
    if (lead?.data?.id) {
      await addNote(
        `<p><strong>Onboarding responses</strong></p><ul>${Object.keys(data)
          .map(
            (key) =>
              `<li><strong>${capitalizeFirstLetter(
                key.replace(/([A-Z])/g, " $1")
              )}:</strong> ${
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
      if (Array.isArray(data.styles) && data.styles.length) {
        const floorPlanNote = `<p><strong>Onboarding styles</strong></p>
        ${
          Array.isArray(data.styles)
            ? data.styles
                .map(
                  (
                    img: string
                  ) => `<a href="${`https://kojcdn.com/v1593890001/website-v2/${img}`}" target="_blank" class="d-inline-block">
        <img 
          alt=""
          class="big-uploaded-image"
          src="${`https://kojcdn.com/w_200,h_150,c_fill/v1593890001/website-v2/${img}`}" />
      </a>`
                )
                .join("")
            : "<em>No styles selected</em>"
        }`;
        await addNote(floorPlanNote, lead.data.id);
      }
      if (Array.isArray(data.photosUrls) && data.photosUrls.length) {
        const photoNote = `<p><strong>Apartment photos</strong></p>
        ${
          Array.isArray(data.photosUrls)
            ? data.photosUrls
                .map(
                  (
                    img: string
                  ) => `<a href="${img}" target="_blank" class="d-inline-block">
        <img
          alt=""
          class="big-uploaded-image"
          src="${img
            .replace(
              "https://kojcdn.com/",
              "https://kojcdn.com/w_200,h_150,c_fill/"
            )
            .replace(".pdf", ".png")}" />
      </a>`
                )
                .join("")
            : "<em>No apartment photos uploaded</em>"
        }`;
        await addNote(photoNote, lead.data.id);
      }
      if (Array.isArray(data.floorPlanUrls) && data.floorPlanUrls.length) {
        const floorPlanNote = `<p><strong>Floor plan photos</strong></p>
        ${
          Array.isArray(data.floorPlanUrls)
            ? data.floorPlanUrls
                .map(
                  (
                    img: string
                  ) => `<a href="${img}" target="_blank" class="d-inline-block">
        <img 
          alt=""
          class="big-uploaded-image"
          src="${img
            .replace("https://kojcdn.com/", "https://kojcdn.com/w_800,c_fill/")
            .replace(".pdf", ".png")}" />
      </a>`
                )
                .join("")
            : "<em>No floor plan photos uploaded</em>"
        }`;
        await addNote(floorPlanNote, lead.data.id);
      }
      if (data?.userId) {
        let elasticData: any = [];
        try {
          elasticData = await getElasticSearchData(data.userId);
        } catch (error) {}
        let page_url_pathname_lang = "";
        let location_city_names_en = "";
        let user_agent_os_name = "";
        let user_agent_browser_name = "";
        let version = "";
        let original_utm_source = "";
        let original_utm_medium = "";
        let original_utm_campaign = "";
        let location_subdivisions_0_names_en = "";
        elasticData.forEach((record: any) => {
          page_url_pathname_lang =
            page_url_pathname_lang || record?._source.page_url_pathname_lang;
          location_city_names_en =
            location_city_names_en || record?._source.location_city_names_en;
          user_agent_os_name =
            user_agent_os_name || record?._source.user_agent_os_name;
          user_agent_browser_name =
            user_agent_browser_name || record?._source.user_agent_browser_name;
          version = version || record?._source.version;
          original_utm_source =
            original_utm_source || record?._source.original_utm_source;
          original_utm_medium =
            original_utm_medium || record?._source.original_utm_medium;
          original_utm_campaign =
            original_utm_campaign || record?._source.original_utm_campaign;
          location_subdivisions_0_names_en =
            location_subdivisions_0_names_en ||
            record?._source.location_subdivisions_0_names_en;
        });
        if (
          page_url_pathname_lang ||
          location_city_names_en ||
          user_agent_os_name ||
          user_agent_browser_name ||
          version ||
          original_utm_source ||
          original_utm_medium ||
          original_utm_campaign ||
          location_subdivisions_0_names_en
        ) {
          let text = "<p><strong>Analytics data</strong></p>";
          text += `<ul>
          <li><strong>City:</strong> ${
            location_city_names_en || "<em>Unknown</em>"
          }</li>
          <li><strong>Area:</strong> ${
            location_subdivisions_0_names_en || "<em>Unknown</em>"
          }</li>
          <li><strong>Operating system:</strong> ${
            user_agent_os_name || "<em>Unknown</em>"
          }</li>
          <li><strong>Browser:</strong> ${
            user_agent_browser_name || "<em>Unknown</em>"
          }</li>
          <li><strong>Site version:</strong> ${
            version || "<em>Unknown</em>"
          }</li>
        </ul>`;
          elasticData.forEach((item: any) => {
            page_url_pathname_lang =
              page_url_pathname_lang || item._source.page_url_pathname_lang;
            location_city_names_en =
              location_city_names_en || item._source.location_city_names_en;
            user_agent_os_name =
              user_agent_os_name || item._source.user_agent_os_name;
            user_agent_browser_name =
              user_agent_browser_name || item._source.user_agent_browser_name;
            version = version || item._source.version;
            original_utm_source =
              original_utm_source || item._source.original_utm_source;
            original_utm_medium =
              original_utm_medium || item._source.original_utm_medium;
            original_utm_campaign =
              original_utm_campaign || item._source.original_utm_campaign;
            location_subdivisions_0_names_en =
              location_subdivisions_0_names_en ||
              item._source.location_subdivisions_0_names_en;
          });
          let updateData: any = {};
          if (original_utm_source !== "<em>Unknown</em>")
            updateData[CustomFields.UTM_SOURCE] = original_utm_source;
          if (original_utm_medium !== "<em>Unknown</em>")
            updateData[CustomFields.UTM_MEDIUM] = original_utm_medium;
          if (original_utm_campaign !== "<em>Unknown</em>")
            updateData[CustomFields.UTM_CAMPAIGN] = original_utm_campaign;
          updateData[CustomFields.ELASTICSEARCH_USER_ID] = data.userId;
          if (data.locationName) {
            const mapsDetails = await getMapsData(data.locationName);
            updateData[CustomFields.LOCATION] = mapsDetails?.formatted_address;
            updateData[`${CustomFields.LOCATION}_geocoded`] = mapsDetails;
          }
          updateData[CustomFields.FIREBASE_RECORD_ID] = firebaseId;
          updateData[CustomFields.REFERRER_SOURCE] =
            original_utm_medium === "online_advertising"
              ? "Online ads"
              : "Organic";
          updateData[CustomFields.RENTAL_PERIOD] = data.period * 12;
          updateData[CustomFields.MONTHLY_BUDGET] = data.budget;
          if (
            (data.timeline || "").match(
              /^\d{4}\-(0?[1-9]|1[012])\-(0?[1-9]|[12][0-9]|3[01])$/
            )
          )
            updateData[CustomFields.MOVING_IN_DAY] = data.timeline;
          updateData[`${CustomFields.MONTHLY_BUDGET}_currency`] = "GI_";
          await updateLead(lead.data.id, updateData);
          const personData: any = {};
          personData[CustomFields.CORRESPONDING_LANGUAGE] = languageName(
            (page_url_pathname_lang || "en-ch").split("-")[0]
          );
          await updatePerson(person.data.id, personData);
          await addNote(text, lead.data.id);
          let label = Labels.COLD;
          if (data.phone) label = Labels.MILD;
          if (
            (Array.isArray(data.photosUrls) && data.photosUrls.length) ||
            (Array.isArray(data.floorPlanUrls) && data.floorPlanUrls.length)
          )
            label = Labels.HOT;
          if (
            Array.isArray(data.photosUrls) &&
            data.photosUrls.length &&
            Array.isArray(data.floorPlanUrls) &&
            data.floorPlanUrls.length
          )
            label = Labels.ON_FIRE;
          await updateLead(lead.data.id, { label });
        }
      }
      await addNote(
        `Lead questionnaire: https://koj.co/en-ch/admin/leads/${lead.data.id}`,
        lead.data.id
      );
      await axios.post(
        "https://slack.com/api/chat.postMessage",
        {
          channel: "C016A9X32KG",
          text: `Lead details on Pipedrive: https://koj.pipedrive.com/deal/${lead.data.id}`,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.SLACK_BOT_ACCESS_TOKEN}`,
          },
        }
      );
    }
  }
};

const migratePreviousLeads = async () => {
  console.log("Migrating previous leads...");
  for await (const item of [subscribers]) {
    const docs = await item.get();
    const ids: string[] = [];
    docs.forEach((doc) => ids.push(doc.id));
    for await (const id of ids.reverse()) {
      const data = (await item.doc(id).get()).data();
      await firebaseToPipedrive(data, id);
    }
  }
};

const getElasticSearchData = async (userId: string) => {
  const data = await client.search({
    index: "analytics-website",
    size: 100,
    body: {
      sort: "date",
      query: {
        match: { user_id: userId },
      },
    },
  });
  console.log("Fetched ElasticSearch data", userId);
  return (((data || {}).body || {}).hits || {}).hits || [];
};

if (process.env.MIGRATE_PREVIOUS_LEADS) migratePreviousLeads();
else migrateLiveLeads();

const updateRecords = async () => {
  const { data } = await api.get(`/deals?api_token=${API_KEY}`);

  const closeDateIds: string[] = data.data
    .filter(
      (item: any) =>
        item[CustomFields.MOVING_IN_DAY] && !item.expected_close_date
    )
    .map((item: any) => item.id);
  for await (const id of closeDateIds) {
    const item = await getLead(id);
    updateLead(id, {
      expected_close_date: dayjs(item.data[CustomFields.MOVING_IN_DAY])
        .subtract(1, "month")
        .format("YYYY-MM-DD"),
    });
    console.log("Update lead with close date", id);
  }

  const subscriptionIds: string[] = data.data
    .filter((item: any) => item.status === "won")
    .map((item: any) => item.id);
  for await (const id of subscriptionIds) {
    const item = await getLead(id);
    console.log(item.data);
    if (
      item.data[CustomFields.MONTHLY_BUDGET] &&
      item.data[CustomFields.RENTAL_PERIOD] &&
      item.data[CustomFields.MOVING_IN_DAY]
    )
      await addSubscription({
        deal_id: id,
        currency: "GI_",
        cadence_type: "monthly",
        cycles_count: item.data[CustomFields.RENTAL_PERIOD],
        cycle_amount: item.data[CustomFields.MONTHLY_BUDGET],
        start_date: item.data[CustomFields.MOVING_IN_DAY],
        payments: [],
      });
    console.log("Update lead with subscription", id);
  }
};
updateRecords();

setInterval(updateRecords, 3600000);
