import axios from "axios";
import {
  initializeApp,
  credential,
  ServiceAccount,
  firestore,
} from "firebase-admin";
import { config } from "dotenv";
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

interface Person {
  name: string;
  email: string[];
  phone?: string[];
}

interface Lead {
  title: string;
  note?: string;
  person_id?: number;
  value?: {
    amount: number;
    currency: string;
  };
  expected_close_date?: string;
  "Potential value"?: {
    amount: number;
    currency: string;
  };
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

export const addLead = async (lead: Lead) => {
  const { data } = await api.post(`/leads?api_token=${API_KEY}`, lead);
  console.log("Added lead", lead.title);
  return data;
};

const sent: string[] = [];
const migrateLiveLeads = async () => {
  for await (const item of [subscribers]) {
    const docs = await item.get();
    docs.forEach((doc) => sent.push(doc.id));
  }
  [subscribers].forEach((item) => {
    item.onSnapshot((snapshot) => {
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (doc.id && !sent.includes(doc.id) && data.email && !data.dev) {
          sent.push(doc.id);
          console.log("Sending", doc.id);
          // const person = await addPerson({
          //   name: "Anand Chowdhary",
          //   email: ["anand@koj.co"],
          // });
          // await addLead({
          //   person_id: person.data.id,
          //   title: "Anand Chowdhary's Bern apartment",
          // });
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
    await addLead({
      person_id: person.data.id,
      title: `${capitalize(data.name.split(" ")[0])}'s${
        data.numberOfRooms ? ` ${data.numberOfRooms}-room` : ""
      } ${
        data.locationName
          ? `${capitalize(data.locationName.split(" ")[0])} apartment`
          : "apartment"
      }`,
      note: `<h2>Firebase responses</h2><ul>${Object.keys(data)
        .map(
          (key) =>
            `<li><strong>${capitalize(
              key.replace(/([A-Z])/g, " $1")
            )}</strong>: ${
              typeof data[key] === "object"
                ? `<code>${JSON.stringify(data[key])}</code>`
                : data[key]
            }</li>`
        )
        .join("")}</ul>`,
      "Potential value": !isNaN(parseInt(data.budget))
        ? {
            amount: parseInt(data.budget),
            currency: "CHF",
          }
        : undefined,
    });
  }
};

const migratePreviousLeads = async () => {
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

(async () => {
  await migratePreviousLeads();
})();
