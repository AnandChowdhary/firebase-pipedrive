import axios from "axios";
import { config } from "dotenv";
config();

const API_KEY = process.env.API_KEY;
const BASE_URL = "https://koj.pipedrive.com/api/v1";

const api = axios.create({
  baseURL: BASE_URL,
});

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
}

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

(async () => {
  const person = await addPerson({
    name: "Anand Chowdhary",
    email: ["anand@koj.co"],
  });
  await addLead({
    person_id: person.data.id,
    title: "Anand Chowdhary's Bern apartment",
  });
})();
