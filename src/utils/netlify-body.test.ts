import { describe, it, expect } from "vitest";
import type { HandlerEvent } from "@netlify/functions";
import { getDecodedEventBody, parseJotFormPostBody } from "./netlify-body";

function evt(partial: Partial<HandlerEvent>): HandlerEvent {
  return {
    httpMethod: "POST",
    headers: {},
    body: null,
    isBase64Encoded: false,
    ...partial,
  } as HandlerEvent;
}

describe("getDecodedEventBody", () => {
  it("returns null for empty body", () => {
    expect(getDecodedEventBody(evt({ body: null }))).toBeNull();
    expect(getDecodedEventBody(evt({ body: "" }))).toBeNull();
  });

  it("returns plain body when not base64", () => {
    expect(getDecodedEventBody(evt({ body: '{"a":1}' }))).toBe('{"a":1}');
  });

  it("decodes base64 body", () => {
    const json = '{"cin":"X","submissionID":"1"}';
    const b64 = Buffer.from(json, "utf8").toString("base64");
    expect(
      getDecodedEventBody(evt({ body: b64, isBase64Encoded: true }))
    ).toBe(json);
  });
});

describe("parseJotFormPostBody", () => {
  it("parses JSON", () => {
    const out = parseJotFormPostBody(
      evt({ body: JSON.stringify({ cin: "AB1", submissionID: "9" }) })
    );
    expect(out).toEqual({ cin: "AB1", submissionID: "9" });
  });

  it("parses form-urlencoded", () => {
    const out = parseJotFormPostBody(evt({ body: "cin=AB1&submissionID=9" }));
    expect(out).toEqual({ cin: "AB1", submissionID: "9" });
  });

  it("parses base64-encoded JSON", () => {
    const json = JSON.stringify({ first_name: "A" });
    const b64 = Buffer.from(json, "utf8").toString("base64");
    expect(parseJotFormPostBody(evt({ body: b64, isBase64Encoded: true }))).toEqual({
      first_name: "A",
    });
  });
});
