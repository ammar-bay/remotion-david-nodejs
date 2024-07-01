import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requestBodySchema } from "./types";

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

export default validateScene;
