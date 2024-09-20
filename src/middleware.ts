import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requestBodySchema } from "./types";
import { connectToDatabase, checkAndProcessQueue } from './utils';
import { processRequestPipeline } from './pipeline';
import { deleteS3Files } from './s3Utils';

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

    // Find and remove entry from MongoDB
    const result = await collection.findOneAndDelete({ videoId });
    console.log(`Attempted to delete entry for videoId: ${videoId}, Deleted count: ${result.ok}`);

    if (!result.value) {
      console.warn(`No entry found for videoId: ${videoId}`);
      return res.status(404).json({ message: "No entry found for the given videoId" });
    }

    console.log(`Entry for videoId: ${videoId} removed from MongoDB`);

    // Delete S3 files if any
    if (result.value.s3Files && result.value.s3Files.length > 0) {
      await deleteS3Files(result.value.s3Files);
      console.log(`Deleted ${result.value.s3Files.length} files from S3 for videoId: ${videoId}`);
    }

    res.status(200).json({ message: "Render completed, entry removed, and S3 files cleaned up" });

    // Check and process the queue after render completion
    await checkAndProcessQueue();
  } catch (error) {
    console.error("Error handling render completion: ", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export { validateScene, handleRenderCompletion };
