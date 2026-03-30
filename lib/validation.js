import { NextResponse } from "next/server.js";

export class RequestValidationError extends Error {
  constructor(message, options = {}) {
    super(message || "Invalid request");
    this.name = "RequestValidationError";
    this.status = Number(options.status || 400);
    this.issues = Array.isArray(options.issues) ? options.issues : [];
  }
}

function flattenIssues(zodError) {
  if (!zodError || !Array.isArray(zodError.issues)) return [];

  return zodError.issues.map((issue) => ({
    path: Array.isArray(issue.path) ? issue.path.join(".") : "",
    message: String(issue.message || "Invalid value"),
    code: String(issue.code || "invalid"),
  }));
}

export function parseWithSchema(schema, payload, options = {}) {
  const parsed = schema.safeParse(payload);
  if (parsed.success) return parsed.data;

  const issues = flattenIssues(parsed.error);
  const message =
    String(options.message || "").trim() ||
    issues[0]?.message ||
    "Invalid request payload";

  throw new RequestValidationError(message, {
    status: Number(options.status || 400),
    issues,
  });
}

export async function parseRequestBody(request, schema, options = {}) {
  let payload = {};
  try {
    payload = await request.json();
  } catch {
    throw new RequestValidationError(options.invalidJsonMessage || "Invalid JSON payload", {
      status: Number(options.status || 400),
    });
  }

  return parseWithSchema(schema, payload, options);
}

export async function parseRouteParams(paramsPromise, schema, options = {}) {
  const params = await paramsPromise;
  return parseWithSchema(schema, params, options);
}

export function validationErrorResponse(error) {
  if (!(error instanceof RequestValidationError)) return null;
  const payload = { error: error.message };
  if (error.issues.length) {
    payload.issues = error.issues;
  }
  return NextResponse.json(payload, { status: error.status || 400 });
}
