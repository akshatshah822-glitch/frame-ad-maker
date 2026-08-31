import { NextResponse } from "next/server";

type RouteHandler<TContext = unknown> = (request: Request, context: TContext) => Response | Promise<Response>;

export function jsonError(message: string, status = 500, headers?: HeadersInit) {
  return NextResponse.json({ error: message }, { status, headers });
}

export function methodNotAllowed(allowed: string[]) {
  return async () => jsonError("Method not allowed", 405, { Allow: allowed.join(", ") });
}

export function withJsonErrors<TContext = unknown>(handler: RouteHandler<TContext>): RouteHandler<TContext> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      console.error("Unhandled API route error", error);
      return jsonError(error instanceof Error && error.message ? error.message : "Internal server error", 500);
    }
  };
}
