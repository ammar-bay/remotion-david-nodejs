import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requestBodySchema } from "./types";
import { connectToDatabase } from './utils';

// Middleware to validate the request body using Zod and apply default values
const validateScene = (req: Request, res: Response, next: NextFunction) => {
  const result = requestBodySchema.safeParse(req.body);
  if (!result.success) {
    // Return error response if validation fails
    return res.status(400).json({
      message: "Invalid request",
      details: result.error.flatten(), // Flatten to get a more user-friendly error structure
    });
  }

  // If validation is successful, replace req.body with the validated and defaulted data
  req.body = requestBodySchema.parse(req.body);

  // Continue with the next middleware
  next();
};

const handleRenderCompletion = async (req: Request, res: Response) => {
  const { videoId } = req.body;

  try {
    const db = await connectToDatabase();
    const collection = db.collection('promotion_video_render');

    // Remove entry from MongoDB
    const result = await collection.deleteOne({ videoId });

    if (result.deletedCount === 0) {
      console.warn(`No entry found for videoId: ${videoId}`);
      return res.status(404).json({ message: "No entry found for the given videoId" });
    }

    res.status(200).json({ message: "Render completed and entry removed" });
  } catch (error) {
    console.error("Error handling render completion: ", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export { validateScene, handleRenderCompletion };
