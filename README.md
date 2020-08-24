# 🔥🚰 Firebase Pipedrive

Automagically post new records from a Firebase Cloud Firestore database as Pipedrive CRM leads in real-time using a Node.js script. The script listens to changes to the database using the `onSnapshot` method and uses the Pipedrive API to add new contacts and leads.

[![Node CI](https://github.com/koj-co/firebase-pipedrive/workflows/Node%20CI/badge.svg)](https://github.com/koj-co/firebase-pipedrive/actions?query=workflow%3A%22Node+CI%22)

## ⭐ Getting started

1. Fork this repository
1. Add required repository secrets or keys in the configuration file
1. Run the Node.js script

## ⚙️ Configuration

Just adding the environment variables in sufficient to get started, but you additionally configure the name and the avatar of the bot too.

### Environment variables

Locally, environment variables are loaded from a `.env` file.

- `FIREBASE_SERVICE_ACCOUNT_KEY` is the Firebase Service Account Key in JSON format
- `FIREBASE_DATABASE_URL` is the Firebase Cloud Firestore database URL, e.g., https://example.firebaseio.com
- `API_KEY` is the API token from Pipedrive

### Deployment

Run the script using `ts-node`:

```bash
npm run run
```

Compile TypeScript and run Node.js script:

```bash
npm run build && npm run start
```

## 📄 License

- Code: [MIT](./LICENSE) © [Koj](https://koj.co)
- "Firebase" is a trademark of Google LLC
- "Pipedrive" is a trademark of Pipedrive Inc.

<p align="center">
  <a href="https://koj.co">
    <img width="44" alt="Koj" src="https://kojcdn.com/v1598284251/website-v2/koj-github-footer_m089ze.svg">
  </a>
</p>
<p align="center">
  <sub>An open source project by <a href="https://koj.co">Koj</a>. <br> <a href="https://koj.co">Furnish your home in style, for as low as CHF175/month →</a></sub>
</p>
