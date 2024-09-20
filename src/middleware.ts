import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requestBodySchema } from "./types";
import { connectToDatabase, checkAndProcessQueue } from './utils';
import { deleteS3Files } from './s3Utils';
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

    // Find the entry in MongoDB
    const result = await collection.findOne({ videoId });

    if (!result) {
      console.warn(`No entry found for videoId: ${videoId}`);
      return res.status(404).json({ message: "No entry found for the given videoId" });
    }

    // Delete S3 files
    await deleteS3Files(videoId);
    console.log(`Deleted S3 files for videoId: ${videoId}`);

    // Remove entry from MongoDB
    await collection.deleteOne({ videoId });
    console.log(`Entry for videoId: ${videoId} removed from MongoDB`);

    res.status(200).json({ message: "Render completed, S3 files cleaned up, and entry removed" });

    // Check and process the queue after render completion
    await checkAndProcessQueue();
  } catch (error) {
    console.error("Error handling render completion: ", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export { validateScene, handleRenderCompletion };
