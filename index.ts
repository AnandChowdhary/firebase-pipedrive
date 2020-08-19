import axios from "axios";
import { config } from "dotenv";
const API_KEY = process.env.PIPEDRIVE_API_TOKEN;
const BASE_URL = "https://koj.pipedrive.com/api/v1";

const api = axios.create({
  baseURL: BASE_URL,
});

export const getPersons = async () => {
  try {
    const { data } = await api.get(`/persons?api_token=${API_KEY}`);
    console.log(data);
  } catch (error) {
    console.log(error);
  }
};

getPersons();
