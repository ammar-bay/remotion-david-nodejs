import { Request, Response } from "express";
import { z } from "zod";

const sceneSchema = z.object({
  videoUrl: z.string().url(),
  audioUrl: z.string().url(),
  padding: z.number().optional(),
  filePath: z.string().optional(),
  captions: z
    .array(
      z.object({
        text: z.string(),
        start: z.number(),
        end: z.number(),
      })
    )
    .optional(),
  version: z.string().optional(),
  version: z.string().optional(),
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

export { RequestBody, Scene, requestBodySchema, sceneSchema };
