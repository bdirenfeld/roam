// ── Countries and what their passport is called ───────────────────────────
// The passport field in Journey settings suggests from this list as you type,
// so "ca" offers Canada and Cambodia and nobody has to guess a spelling
// (Brennan, Sep 2026). Stored as the demonym ("Canadian"), which is what the
// entry check reads and what the row already says.

export interface Country {
  name: string;
  demonym: string;
}

export const COUNTRIES: Country[] = [
  { name: "Afghanistan", demonym: "Afghan" }, { name: "Albania", demonym: "Albanian" }, { name: "Algeria", demonym: "Algerian" },
  { name: "Andorra", demonym: "Andorran" }, { name: "Angola", demonym: "Angolan" }, { name: "Antigua and Barbuda", demonym: "Antiguan" },
  { name: "Argentina", demonym: "Argentine" }, { name: "Armenia", demonym: "Armenian" }, { name: "Australia", demonym: "Australian" },
  { name: "Austria", demonym: "Austrian" }, { name: "Azerbaijan", demonym: "Azerbaijani" }, { name: "Bahamas", demonym: "Bahamian" },
  { name: "Bahrain", demonym: "Bahraini" }, { name: "Bangladesh", demonym: "Bangladeshi" }, { name: "Barbados", demonym: "Barbadian" },
  { name: "Belarus", demonym: "Belarusian" }, { name: "Belgium", demonym: "Belgian" }, { name: "Belize", demonym: "Belizean" },
  { name: "Benin", demonym: "Beninese" }, { name: "Bhutan", demonym: "Bhutanese" }, { name: "Bolivia", demonym: "Bolivian" },
  { name: "Bosnia and Herzegovina", demonym: "Bosnian" }, { name: "Botswana", demonym: "Botswanan" }, { name: "Brazil", demonym: "Brazilian" },
  { name: "Brunei", demonym: "Bruneian" }, { name: "Bulgaria", demonym: "Bulgarian" }, { name: "Burkina Faso", demonym: "Burkinabé" },
  { name: "Burundi", demonym: "Burundian" }, { name: "Cambodia", demonym: "Cambodian" }, { name: "Cameroon", demonym: "Cameroonian" },
  { name: "Canada", demonym: "Canadian" }, { name: "Cape Verde", demonym: "Cape Verdean" }, { name: "Central African Republic", demonym: "Central African" },
  { name: "Chad", demonym: "Chadian" }, { name: "Chile", demonym: "Chilean" }, { name: "China", demonym: "Chinese" },
  { name: "Colombia", demonym: "Colombian" }, { name: "Comoros", demonym: "Comoran" }, { name: "Congo (Democratic Republic)", demonym: "Congolese" },
  { name: "Congo (Republic)", demonym: "Congolese" }, { name: "Costa Rica", demonym: "Costa Rican" }, { name: "Côte d'Ivoire", demonym: "Ivorian" },
  { name: "Croatia", demonym: "Croatian" }, { name: "Cuba", demonym: "Cuban" }, { name: "Cyprus", demonym: "Cypriot" },
  { name: "Czech Republic", demonym: "Czech" }, { name: "Denmark", demonym: "Danish" }, { name: "Djibouti", demonym: "Djiboutian" },
  { name: "Dominica", demonym: "Dominican" }, { name: "Dominican Republic", demonym: "Dominican" }, { name: "Ecuador", demonym: "Ecuadorian" },
  { name: "Egypt", demonym: "Egyptian" }, { name: "El Salvador", demonym: "Salvadoran" }, { name: "Equatorial Guinea", demonym: "Equatoguinean" },
  { name: "Eritrea", demonym: "Eritrean" }, { name: "Estonia", demonym: "Estonian" }, { name: "Eswatini", demonym: "Swazi" },
  { name: "Ethiopia", demonym: "Ethiopian" }, { name: "Fiji", demonym: "Fijian" }, { name: "Finland", demonym: "Finnish" },
  { name: "France", demonym: "French" }, { name: "Gabon", demonym: "Gabonese" }, { name: "Gambia", demonym: "Gambian" },
  { name: "Georgia", demonym: "Georgian" }, { name: "Germany", demonym: "German" }, { name: "Ghana", demonym: "Ghanaian" },
  { name: "Greece", demonym: "Greek" }, { name: "Grenada", demonym: "Grenadian" }, { name: "Guatemala", demonym: "Guatemalan" },
  { name: "Guinea", demonym: "Guinean" }, { name: "Guinea-Bissau", demonym: "Bissau-Guinean" }, { name: "Guyana", demonym: "Guyanese" },
  { name: "Haiti", demonym: "Haitian" }, { name: "Honduras", demonym: "Honduran" }, { name: "Hong Kong", demonym: "Hong Kong" },
  { name: "Hungary", demonym: "Hungarian" }, { name: "Iceland", demonym: "Icelandic" }, { name: "India", demonym: "Indian" },
  { name: "Indonesia", demonym: "Indonesian" }, { name: "Iran", demonym: "Iranian" }, { name: "Iraq", demonym: "Iraqi" },
  { name: "Ireland", demonym: "Irish" }, { name: "Israel", demonym: "Israeli" }, { name: "Italy", demonym: "Italian" },
  { name: "Jamaica", demonym: "Jamaican" }, { name: "Japan", demonym: "Japanese" }, { name: "Jordan", demonym: "Jordanian" },
  { name: "Kazakhstan", demonym: "Kazakh" }, { name: "Kenya", demonym: "Kenyan" }, { name: "Kiribati", demonym: "I-Kiribati" },
  { name: "Kosovo", demonym: "Kosovar" }, { name: "Kuwait", demonym: "Kuwaiti" }, { name: "Kyrgyzstan", demonym: "Kyrgyz" },
  { name: "Laos", demonym: "Lao" }, { name: "Latvia", demonym: "Latvian" }, { name: "Lebanon", demonym: "Lebanese" },
  { name: "Lesotho", demonym: "Basotho" }, { name: "Liberia", demonym: "Liberian" }, { name: "Libya", demonym: "Libyan" },
  { name: "Liechtenstein", demonym: "Liechtensteiner" }, { name: "Lithuania", demonym: "Lithuanian" }, { name: "Luxembourg", demonym: "Luxembourgish" },
  { name: "Madagascar", demonym: "Malagasy" }, { name: "Malawi", demonym: "Malawian" }, { name: "Malaysia", demonym: "Malaysian" },
  { name: "Maldives", demonym: "Maldivian" }, { name: "Mali", demonym: "Malian" }, { name: "Malta", demonym: "Maltese" },
  { name: "Marshall Islands", demonym: "Marshallese" }, { name: "Mauritania", demonym: "Mauritanian" }, { name: "Mauritius", demonym: "Mauritian" },
  { name: "Mexico", demonym: "Mexican" }, { name: "Micronesia", demonym: "Micronesian" }, { name: "Moldova", demonym: "Moldovan" },
  { name: "Monaco", demonym: "Monégasque" }, { name: "Mongolia", demonym: "Mongolian" }, { name: "Montenegro", demonym: "Montenegrin" },
  { name: "Morocco", demonym: "Moroccan" }, { name: "Mozambique", demonym: "Mozambican" }, { name: "Myanmar", demonym: "Burmese" },
  { name: "Namibia", demonym: "Namibian" }, { name: "Nauru", demonym: "Nauruan" }, { name: "Nepal", demonym: "Nepali" },
  { name: "Netherlands", demonym: "Dutch" }, { name: "New Zealand", demonym: "New Zealander" }, { name: "Nicaragua", demonym: "Nicaraguan" },
  { name: "Niger", demonym: "Nigerien" }, { name: "Nigeria", demonym: "Nigerian" }, { name: "North Korea", demonym: "North Korean" },
  { name: "North Macedonia", demonym: "Macedonian" }, { name: "Norway", demonym: "Norwegian" }, { name: "Oman", demonym: "Omani" },
  { name: "Pakistan", demonym: "Pakistani" }, { name: "Palau", demonym: "Palauan" }, { name: "Palestine", demonym: "Palestinian" },
  { name: "Panama", demonym: "Panamanian" }, { name: "Papua New Guinea", demonym: "Papua New Guinean" }, { name: "Paraguay", demonym: "Paraguayan" },
  { name: "Peru", demonym: "Peruvian" }, { name: "Philippines", demonym: "Filipino" }, { name: "Poland", demonym: "Polish" },
  { name: "Portugal", demonym: "Portuguese" }, { name: "Qatar", demonym: "Qatari" }, { name: "Romania", demonym: "Romanian" },
  { name: "Russia", demonym: "Russian" }, { name: "Rwanda", demonym: "Rwandan" }, { name: "Saint Kitts and Nevis", demonym: "Kittitian" },
  { name: "Saint Lucia", demonym: "Saint Lucian" }, { name: "Saint Vincent and the Grenadines", demonym: "Vincentian" }, { name: "Samoa", demonym: "Samoan" },
  { name: "San Marino", demonym: "Sammarinese" }, { name: "São Tomé and Príncipe", demonym: "São Toméan" }, { name: "Saudi Arabia", demonym: "Saudi" },
  { name: "Senegal", demonym: "Senegalese" }, { name: "Serbia", demonym: "Serbian" }, { name: "Seychelles", demonym: "Seychellois" },
  { name: "Sierra Leone", demonym: "Sierra Leonean" }, { name: "Singapore", demonym: "Singaporean" }, { name: "Slovakia", demonym: "Slovak" },
  { name: "Slovenia", demonym: "Slovenian" }, { name: "Solomon Islands", demonym: "Solomon Islander" }, { name: "Somalia", demonym: "Somali" },
  { name: "South Africa", demonym: "South African" }, { name: "South Korea", demonym: "South Korean" }, { name: "South Sudan", demonym: "South Sudanese" },
  { name: "Spain", demonym: "Spanish" }, { name: "Sri Lanka", demonym: "Sri Lankan" }, { name: "Sudan", demonym: "Sudanese" },
  { name: "Suriname", demonym: "Surinamese" }, { name: "Sweden", demonym: "Swedish" }, { name: "Switzerland", demonym: "Swiss" },
  { name: "Syria", demonym: "Syrian" }, { name: "Taiwan", demonym: "Taiwanese" }, { name: "Tajikistan", demonym: "Tajik" },
  { name: "Tanzania", demonym: "Tanzanian" }, { name: "Thailand", demonym: "Thai" }, { name: "Timor-Leste", demonym: "Timorese" },
  { name: "Togo", demonym: "Togolese" }, { name: "Tonga", demonym: "Tongan" }, { name: "Trinidad and Tobago", demonym: "Trinidadian" },
  { name: "Tunisia", demonym: "Tunisian" }, { name: "Turkey", demonym: "Turkish" }, { name: "Turkmenistan", demonym: "Turkmen" },
  { name: "Tuvalu", demonym: "Tuvaluan" }, { name: "Uganda", demonym: "Ugandan" }, { name: "Ukraine", demonym: "Ukrainian" },
  { name: "United Arab Emirates", demonym: "Emirati" }, { name: "United Kingdom", demonym: "British" }, { name: "United States", demonym: "American" },
  { name: "Uruguay", demonym: "Uruguayan" }, { name: "Uzbekistan", demonym: "Uzbek" }, { name: "Vanuatu", demonym: "Ni-Vanuatu" },
  { name: "Vatican City", demonym: "Vatican" }, { name: "Venezuela", demonym: "Venezuelan" }, { name: "Vietnam", demonym: "Vietnamese" },
  { name: "Yemen", demonym: "Yemeni" }, { name: "Zambia", demonym: "Zambian" }, { name: "Zimbabwe", demonym: "Zimbabwean" },
];

/** Countries whose name or demonym starts with (then contains) what was typed. */
export function suggestCountries(query: string, limit = 6): Country[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const starts = COUNTRIES.filter((c) => norm(c.name).startsWith(q) || norm(c.demonym).startsWith(q));
  const contains = COUNTRIES.filter((c) => !starts.includes(c) && (norm(c.name).includes(q) || norm(c.demonym).includes(q)));
  return [...starts, ...contains].slice(0, limit);
}
