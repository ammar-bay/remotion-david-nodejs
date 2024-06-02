// export interface Scene {
//   video: string;
//   audio: string;
//   padding?: number;
// }
//
// export interface RequestBody {
//   scenes: Scene[];
//
// }
import { z } from "zod";

// Define the Zod schemas
const sceneSchema = z.object({
  videoUrl: z.string().url(),
  audioUrl: z.string().url(),
  padding: z.number().optional(), // Mark as optional since it was not required in the Joi schema
  captions: z
    .array(
      z.object({
        text: z.string(),
        startInSeconds: z.number(),
      })
    )
    .optional(),
});

const requestBodySchema = z.object({
  scenes: z.array(sceneSchema),
  fontUrl: z.string().optional(),
  borderColor: z.string().default("#000000"),
  fillColor: z.string().default("#ffffff"),
  layout: z.string().default("horizontal"),
  caption: z.boolean().default(true),
  videoId: z.string(),
});

type Scene = z.infer<typeof sceneSchema>;
type RequestBody = z.infer<typeof requestBodySchema>;

export { sceneSchema, requestBodySchema, Scene, RequestBody };
