import { userSocketIDs } from "../app.js";

export const getOtherMember = (members, userId) =>
  members.find((member) => member._id.toString() !== userId.toString());

export const getSockets = (users = []) => {
  const sockets = users.map((user) => userSocketIDs.get(user.toString()));

  return sockets;
};

export const getBase64 = (file) =>
  `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

// Mapping of frontend language codes to GCP STT language codes
const languageCodeMapping = {
  hi: 'hi-IN',  // Hindi
  bn: 'bn-BD',  // Bengali (Bangladesh)
  te: 'te-IN',  // Telugu
  mr: 'mr-IN',  // Marathi
  ta: 'ta-IN',  // Tamil
  ur: 'ur-IN',  // Urdu
  gu: 'gu-IN',  // Gujarati
  kn: 'kn-IN',  // Kannada
  ml: 'ml-IN',  // Malayalam
  pa: 'pa-IN',  // Punjabi
  or: 'or-IN',  // Odia
  as: 'as-IN',  // Assamese
  sd: 'sd-IN',  // Sindhi
  ne: 'ne-NP',  // Nepali
  en: 'en-US',  // English
  es: 'es-ES',  // Spanish
  zh: 'zh-CN',  // Chinese (Simplified)
  fr: 'fr-FR',  // French
  ar: 'ar-XA',  // Arabic
  pt: 'pt-BR',  // Portuguese (Brazil)
  ru: 'ru-RU',  // Russian
  de: 'de-DE',  // German
  ja: 'ja-JP',  // Japanese
  ko: 'ko-KR',  // Korean
  it: 'it-IT',  // Italian
  tr: 'tr-TR',  // Turkish
  vi: 'vi-VN',  // Vietnamese
  pl: 'pl-PL',  // Polish
  uk: 'uk-UA',  // Ukrainian
  nl: 'nl-NL',  // Dutch
  sv: 'sv-SE',  // Swedish
  th: 'th-TH',  // Thai
  el: 'el-GR',  // Greek
  cs: 'cs-CZ',  // Czech
  ro: 'ro-RO',  // Romanian
  hu: 'hu-HU',  // Hungarian
  fi: 'fi-FI',  // Finnish
  da: 'da-DK'   // Danish
};

// Function to get the GCP language code
export const getGcpLanguageCode = (frontendLangCode) => {
  // Return the GCP language code corresponding to the frontend language code
  return languageCodeMapping[frontendLangCode] || null;  // Return null if not found
}
