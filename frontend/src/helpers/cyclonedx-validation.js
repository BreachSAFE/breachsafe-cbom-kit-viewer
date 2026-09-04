/*
 * SPDX-FileCopyrightText: 2026 BreachSAFE <https://www.breachsafe.io>
 * SPDX-License-Identifier: Apache-2.0
 */

import Ajv from "ajv";

import bom16Schema from "@/schemas/cyclonedx-1.7.1/bom-1.6.schema.json";
import bom17Schema from "@/schemas/cyclonedx-1.7.1/bom-1.7.schema.json";
import cryptographyDefsSchema from "@/schemas/cyclonedx-1.7.1/cryptography-defs.schema.json";
import jsfSchema from "@/schemas/cyclonedx-1.7.1/jsf-0.82.schema.json";
import spdxSchema from "@/schemas/cyclonedx-1.7.1/spdx.schema.json";

export const supportedCycloneDxVersions = Object.freeze(["1.6", "1.7"]);

const ajv = new Ajv({
  addUsedSchema: false,
  allErrors: false,
  jsonPointers: true,
  logger: false,
  schemaId: "auto",
  schemas: [spdxSchema, jsfSchema, cryptographyDefsSchema],
  unknownFormats: ["idn-email", "iri-reference"],
});

const validators = Object.freeze({
  "1.6": ajv.compile(bom16Schema),
  "1.7": ajv.compile(bom17Schema),
});

function validationError(dataPath, message) {
  return { dataPath, message };
}

export function validateCycloneDxBom(cbom) {
  if (cbom === undefined || cbom === null || typeof cbom !== "object") {
    return {
      errors: [validationError("", "should be a JSON object")],
      unsupportedVersion: false,
      valid: false,
    };
  }

  if (!Object.hasOwn(cbom, "specVersion")) {
    return {
      errors: [validationError("", "should have required property 'specVersion'")],
      unsupportedVersion: false,
      valid: false,
    };
  }

  if (typeof cbom.specVersion !== "string") {
    return {
      errors: [validationError("/specVersion", "should be a string")],
      unsupportedVersion: false,
      valid: false,
    };
  }

  const validate = validators[cbom.specVersion];
  if (!validate) {
    return {
      errors: [
        validationError(
          "/specVersion",
          `is not supported; expected ${supportedCycloneDxVersions.join(" or ")}`
        ),
      ],
      unsupportedVersion: true,
      valid: false,
    };
  }

  const valid = validate(cbom);
  return {
    errors: valid ? [] : [...(validate.errors || [])],
    unsupportedVersion: false,
    valid,
  };
}
