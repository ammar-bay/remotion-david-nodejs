import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requestBodySchema } from "./types";
import { connectToDatabase, checkAndProcessQueue } from './utils';
import { processRequestPipeline } from './pipeline';

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
  console.log("handleRenderCompletion called with videoId: ", req.body.videoId);
  const { videoId } = req.body;

  try {
    const db = await connectToDatabase();
    console.log("Connected to MongoDB for deletion operation");
    const collection = db.collection('promotion_video_render');

    // Remove entry from MongoDB
    const result = await collection.deleteOne({ videoId });
    console.log(`Attempted to delete entry for videoId: ${videoId}, Deleted count: ${result.deletedCount}`);

    if (result.deletedCount === 0) {
      console.warn(`No entry found for videoId: ${videoId}`);
      return res.status(404).json({ message: "No entry found for the given videoId" });
    }

    console.log(`Entry for videoId: ${videoId} removed from MongoDB`);
    // Check and process the queue after render completion
    await checkAndProcessQueue();

    res.status(200).json({ message: "Render completed and entry removed" });

    // Check and process the queue after render completion
    await checkAndProcessQueue();
  } catch (error) {
    console.error("Error handling render completion: ", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export { validateScene, handleRenderCompletion };
