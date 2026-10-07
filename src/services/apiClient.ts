import axios from 'axios';

// Groq API Keys provided
const GROQ_API_KEYS = [
  import.meta.env.VITE_GROQ_API_KEY_1 || "",
  import.meta.env.VITE_GROQ_API_KEY_2 || "",
  import.meta.env.VITE_GROQ_API_KEY_3 || "",
  import.meta.env.VITE_GROQ_API_KEY_4 || "",
  import.meta.env.VITE_GROQ_API_KEY_5 || ""
].filter(Boolean);

let currentGroqKeyIndex = 0;

/**
 * Returns the next Groq API key using a round-robin switch method.
 * This prevents single keys from being rate-limited quickly when using multiple agents.
 */
export const getNextGroqApiKey = () => {
  const key = GROQ_API_KEYS[currentGroqKeyIndex];
  // Switch to the next key for the next request
  currentGroqKeyIndex = (currentGroqKeyIndex + 1) % GROQ_API_KEYS.length;
  console.log(`Using Groq API Key at index: ${currentGroqKeyIndex}`);
  return key;
};

// Other API Keys
export const WEATHER_API_KEY = import.meta.env.VITE_WEATHER_API_KEY || "";
export const APIFY_TOKEN = import.meta.env.VITE_APIFY_TOKEN || "";
export const SCRAPE_DO_TOKEN = import.meta.env.VITE_SCRAPE_DO_TOKEN || "";

// --- Scrape.do Services ---

// 1. Amazon Search
export const scrapeAmazonSearch = async (query: string) => {
  // Pass the targetUrl as needed by scrape.do, though your snippet left targetUrl empty,
  // we normally need to pass the target URL we want to scrape.
  const targetUrl = encodeURIComponent(`https://www.amazon.in/s?k=${query}`);
  const url = `https://api.scrape.do/plugin/amazon/search?geocode=in&token=${SCRAPE_DO_TOKEN}&url=${targetUrl}`;
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error("Error scraping Amazon:", error);
    throw error;
  }
};

// 2. Google YouTube
export const scrapeYouTube = async (query: string) => {
  const targetUrl = encodeURIComponent(`https://www.youtube.com/results?search_query=${query}`);
  const url = `https://api.scrape.do/plugin/google/youtube?token=${SCRAPE_DO_TOKEN}&url=${targetUrl}`;
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error("Error scraping YouTube:", error);
    throw error;
  }
};

// 3. Google News
export const scrapeGoogleNews = async (query: string) => {
  const targetUrl = encodeURIComponent(`https://news.google.com/search?q=${query}`);
  const url = `https://api.scrape.do/plugin/google/news?token=${SCRAPE_DO_TOKEN}&url=${targetUrl}`;
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error("Error scraping Google News:", error);
    throw error;
  }
};

// 4. Google Trending
export const scrapeGoogleTrending = async () => {
  const targetUrl = encodeURIComponent("https://trends.google.com/trends/trendingsearches/daily?geo=IN");
  const url = `https://api.scrape.do/plugin/google/trending?token=${SCRAPE_DO_TOKEN}&url=${targetUrl}`;
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error("Error scraping Google Trending:", error);
    throw error;
  }
};

// 5. Google Search
export const scrapeGoogleSearch = async (query: string) => {
  const targetUrl = encodeURIComponent(`https://www.google.com/search?q=${query}`);
  const url = `https://api.scrape.do/plugin/google/search?device=desktop&token=${SCRAPE_DO_TOKEN}&url=${targetUrl}`;
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error("Error scraping Google Search:", error);
    throw error;
  }
};

// 6. Google Maps Search
export const scrapeGoogleMaps = async (query: string) => {
  const targetUrl = encodeURIComponent(`https://www.google.com/maps/search/${query}`);
  const url = `https://api.scrape.do/plugin/google/maps/search?token=${SCRAPE_DO_TOKEN}&url=${targetUrl}`;
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error("Error scraping Google Maps:", error);
    throw error;
  }
};

// --- Open-Meteo API ---

/**
 * Fetch live weather conditions for a store region.
 */
export const fetchStoreWeather = async (lat: number, lon: number) => {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,rain`;
  try {
    const response = await axios.get(url);
    return response.data.current;
  } catch (error) {
    console.error("Error fetching weather:", error);
    throw error;
  }
};

// --- Groq Agent Helper ---

/**
 * Example function to call Groq API using the round-robin key switcher.
 */
export const callGroqApi = async (messages: any[], model = "qwen/qwen3.8-27b") => {
  const apiKey = getNextGroqApiKey();
  
  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: model,
        messages: messages
      },
      {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error calling Groq API:", error);
    throw error;
  }
};
