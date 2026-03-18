import type { MediaUnderstandingProvider } from "../../types.js";
import { describeImageWithModel } from "../image.js";

export const openrouterProvider: MediaUnderstandingProvider = {
  id: "openrouter",
  capabilities: ["image"],
  describeImage: describeImageWithModel,
};
