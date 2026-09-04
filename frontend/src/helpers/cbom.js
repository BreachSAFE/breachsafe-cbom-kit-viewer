import {ErrorStatus, model} from "@/model.js";
import {validateCycloneDxBom} from "@/helpers/cyclonedx-validation.js";
import {isSourceCodeOccurrence} from "@/helpers/general.js";

function checkCbomValidity(cbom) {
  const validation = validateCycloneDxBom(cbom);
  const components = cbom && Array.isArray(cbom.components) ? cbom.components : [];
  const isIgnoringSomeComponent = components.some(
    (component) => component.type !== "cryptographic-asset"
  );

  if (isIgnoringSomeComponent && validation.valid) {
    model.addError(ErrorStatus.IgnoredComponent);
  }

  if (validation.unsupportedVersion) {
    console.warn(
      `Unsupported CycloneDX version: ${String(cbom && cbom.specVersion)}`
    );
    model.addError(ErrorStatus.UnsupportedCbomVersion);
  } else if (!validation.valid) {
    const errorMessages = validation.errors.map(
      (error) => `${error.dataPath || "/"} ${error.message}`
    );
    console.error(
      `Invalid CBOM detected. ${errorMessages.length} errors:\n   - ${errorMessages.join("\n   - ")}`
    );
    model.addError(ErrorStatus.InvalidCbom);
  }
}

export function resolvePath(obj, path) {
  const pathParts = path.split('.');

  function traverse(currentObj, remainingPath) {
      if (remainingPath.length === 0) {
          // Base case: if we have reached the last part of the path.
          // Always return an array, except when `undefined`
          return currentObj !== undefined && !Array.isArray(currentObj) ? [currentObj] : currentObj;
      }

      const key = remainingPath[0];  // current path part
      const nextPath = remainingPath.slice(1);  // remaining path after the current key

      if (Array.isArray(currentObj)) {
          // If the current object is an array, we need to traverse each element in the array
          return currentObj
                .map(item => traverse(item, remainingPath))  // Recursively process each item
                .filter(item => item !== undefined)          // Filter out undefined results
                .flat();      
      }

      if (typeof currentObj === 'object' && currentObj !== null && Object.hasOwn(currentObj, key)) {
          // If the current object has the required key, continue traversing
          return traverse(currentObj[key], nextPath);
      }

      // If we can't find the key in the current object, return undefined
      return undefined;
  }

  return traverse(obj, pathParts);
}


function setDependenciesMap(cbom) {
  const dependsMap = new Map();
  const isDependedOnMap = new Map();
  const providesMap = new Map();
  const isProvidedByMap = new Map();
  const detectionsMap = new Map(); /* bom-ref -> component */

  /* Dependencies defined at the top level */
  if (Object.hasOwn(cbom, "dependencies") && Array.isArray(cbom.dependencies)) {
    for (const dep of cbom.dependencies) {
      if (Object.hasOwn(dep, "ref")) {
        let bomRef = dep.ref;

        // dependsOn
        if (Object.hasOwn(dep, "dependsOn") && Array.isArray(dep.dependsOn)) {
          for (const dependsOnRef of dep.dependsOn) {
            if (!dependsMap.has(bomRef)) {
              dependsMap.set(bomRef, []);
            }
            // Add a pair [ref, path]
            dependsMap.get(bomRef).push([dependsOnRef, "dependencies.dependsOn"]);

            if (!isDependedOnMap.has(dependsOnRef)) {
              isDependedOnMap.set(dependsOnRef, []);
            }
            // Add a pair [ref, path]
            isDependedOnMap.get(dependsOnRef).push([bomRef, "dependencies.dependsOn"]);
          }
        }

        // provides
        if (Object.hasOwn(dep, "provides") && Array.isArray(dep.provides)) {
          for (const providesRef of dep.provides) {
            if (!providesMap.has(bomRef)) {
              providesMap.set(bomRef, []);
            }
            // Add a pair [ref, path]
            providesMap.get(bomRef).push([providesRef, "dependencies.provides"]);

            if (!isProvidedByMap.has(providesRef)) {
              isProvidedByMap.set(providesRef, []);
            }
            // Add a pair [ref, path]
            isProvidedByMap.get(providesRef).push([bomRef, "dependencies.provides"]);
          }
        }
      }
    }
  }

  /* Dependencies defined in components */
  for (const detection of getDetections()) {
    if (Object.hasOwn(detection, "bom-ref")) {
      let bomRef = detection["bom-ref"];

      /* Building the map of detections */
      detectionsMap.set(bomRef, detection);

      /* Adding additional dependencies */
      let dependencyPaths = [
        "cryptoProperties.certificateProperties.signatureAlgorithmRef",
        "cryptoProperties.certificateProperties.subjectPublicKeyRef",
        "cryptoProperties.protocolProperties.cipherSuites.algorithms",
        "cryptoProperties.protocolProperties.ikev2TransformTypes.encr",
        "cryptoProperties.protocolProperties.ikev2TransformTypes.prf",
        "cryptoProperties.protocolProperties.ikev2TransformTypes.integ",
        "cryptoProperties.protocolProperties.ikev2TransformTypes.ke",
        "cryptoProperties.protocolProperties.ikev2TransformTypes.esn",
        "cryptoProperties.protocolProperties.ikev2TransformTypes.auth",
        "cryptoProperties.protocolProperties.cryptoRefArray",
        "cryptoProperties.relatedCryptoMaterialProperties.algorithmRef",
        "cryptoProperties.relatedCryptoMaterialProperties.securedBy.algorithmRef"
      ]

      for (const path of dependencyPaths) {
        const allRefs = resolvePath(detection, path);
        if (allRefs !== undefined) {
          for (const ref of allRefs) {
            if (!dependsMap.has(bomRef)) {
              dependsMap.set(bomRef, []);
            }
            // Add a pair [ref, path]
            dependsMap.get(bomRef).push([ref, path]);

            if (!isDependedOnMap.has(ref)) {
              isDependedOnMap.set(ref, []);
            }
            // Add a pair [ref, path]
            isDependedOnMap.get(ref).push([bomRef, path]);
          }
        }
      }
    }
  }

  model.dependencies = { dependsMap, isDependedOnMap, providesMap, isProvidedByMap, detectionsMap };
}

export function getDependencies(bomRef) {
  const dependsMap = model.dependencies["dependsMap"];
  const isDependedOnMap = model.dependencies["isDependedOnMap"];
  const providesMap = model.dependencies["providesMap"];
  const isProvidedByMap = model.dependencies["isProvidedByMap"];
  const detectionsMap = model.dependencies["detectionsMap"];
  var dependsComponentList = [];
  var isDependedOnComponentList = [];
  var providesComponentList = [];
  var isProvidedByComponentList = [];

  const dependsRefPathList = dependsMap.get(bomRef) || [];
  const isDependedOnRefPathList = isDependedOnMap.get(bomRef) || [];
  const providesRefPathList = providesMap.get(bomRef) || [];
  const isProvidedByRefPathList = isProvidedByMap.get(bomRef) || [];

  for (const refPath of dependsRefPathList) {
    let ref = refPath[0]
    let path = refPath[1]
    if (detectionsMap.has(ref)) {
      // Add a pair [component, path]
      dependsComponentList.push([detectionsMap.get(ref), path]);
    }
  }
  for (const refPath of isDependedOnRefPathList) {
    let ref = refPath[0]
    let path = refPath[1]
    if (detectionsMap.has(ref)) {
      // Add a pair [component, path]
      isDependedOnComponentList.push([detectionsMap.get(ref), path]);
    }
  }
  for (const refPath of providesRefPathList) {
    let ref = refPath[0]
    let path = refPath[1]
    if (detectionsMap.has(ref)) {
      // Add a pair [component, path]
      providesComponentList.push([detectionsMap.get(ref), path]);
    }
  }
  for (const refPath of isProvidedByRefPathList) {
    let ref = refPath[0]
    let path = refPath[1]
    if (detectionsMap.has(ref)) {
      // Add a pair [component, path]
      isProvidedByComponentList.push([detectionsMap.get(ref), path]);
    }
  }

  return { dependsComponentList, isDependedOnComponentList, providesComponentList, isProvidedByComponentList };
}


export function setCbom(cbom) {
  checkCbomValidity(cbom);
  model.cbom = cbom;

  if (Object.hasOwn(cbom, "metadata")) {
    if (Object.hasOwn(cbom.metadata, "properties") && Array.isArray(cbom.metadata.properties)) {
      cbom.metadata.properties.forEach(function (prop) {
        if (Object.hasOwn(prop, "name") && Object.hasOwn(prop, "value")) {
          switch (prop.name) {
            case "gitUrl":
              model.codeOrigin.gitUrl = prop.value;
              break;
            case "revision":
              model.codeOrigin.revision = prop.value;
              break;
            case "subfolder":
              model.codeOrigin.subfolder = prop.value
              break;
            case "commit":
              model.codeOrigin.commitID = prop.value
          }
        }
      });
    }
  }
}

export function showResultFromApi(cbomApi) {
  let cbom = getCbomFromScan(cbomApi);
  setCbom(cbom);
  setDependenciesMap(cbom)
  model.codeOrigin.projectIdentifier = cbomApi.projectIdentifier
  model.codeOrigin.gitUrl = cbomApi.gitUrl;
  model.codeOrigin.revision = cbomApi.branch;
  model.showResults = true;
}

export function showResultFromUpload(cbom, name) {
  setCbom(cbom);
  setDependenciesMap(cbom)
  model.codeOrigin.uploadedFileName = name;
  model.showResults = true;
}

// Takes a Scan object as returned by the API and returns the CBOM as an Object.
export function getCbomFromScan(scan) {
  if (scan && scan.bom) {
    return scan.bom
  }
  console.error("Error fetching latest CBOM");
  model.addError(ErrorStatus.InvalidCbom);
  return JSON.parse("{}");

}

export function getDetections() {
  var detections = getDetectionsFromCbom(model.cbom);
  if (model.scanning.isScanning) {
    detections = model.scanning.liveDetections;
  }
  return removeBomRefFromDetectionNames(detections); 
}

function removeBomRefFromDetectionNames(detections) {
  // Some detections have a name "actual-name@xxx-xxx-xxx", containing their bomRef
  // We remove this bomRef from a cleaner visualization
  detections.forEach(function (detection) {
    if (Object.hasOwn(detection, "name") && detection.name.includes("@")) {
      detection.name = detection.name.split('@')[0]
    }
  })
  return detections
}

// Takes a CBOM Object and returns an array of detections
export function getDetectionsFromCbom(cbom) {
  // No invalid CBOM error handling occurs in this method because it is used to display reactive information, which could result in an infinite loop of errors
  try {
    if (cbom === undefined || cbom === null) {
      return [];
    }
    if (Object.hasOwn(cbom, "components") && Array.isArray(cbom.components)) {
      var detections = [];
      // Keep source-code locations independently navigable, while grouping
      // endpoint evidence records that describe the same asset at one URI.
      cbom.components.forEach(function (component) {
        if (Object.hasOwn(component, "type") && component.type === "cryptographic-asset") {
          const occurrences = component.evidence?.occurrences;
          if (Array.isArray(occurrences) && occurrences.length > 0) {
            const sourceCodeOccurrences = occurrences.filter(isSourceCodeOccurrence);
            const otherOccurrences = occurrences.filter(
              (occurrence) => !isSourceCodeOccurrence(occurrence)
            );

            // Keep file-and-line source contexts independently navigable. Endpoint
            // evidence records are facets of one component and must not inflate the
            // cryptographic-asset count or duplicate the table row.
            sourceCodeOccurrences.forEach(function (singleContext) {
              let detectionWithSingleContext = JSON.parse(
                JSON.stringify(component)
              );
              detectionWithSingleContext.evidence.occurrences = [
                singleContext,
              ];
              detections.push(detectionWithSingleContext);
            });

            const endpointOccurrencesByLocation = new Map();
            otherOccurrences.forEach((occurrence) => {
              const key = occurrence.location;
              if (!endpointOccurrencesByLocation.has(key)) {
                endpointOccurrencesByLocation.set(key, []);
              }
              endpointOccurrencesByLocation.get(key).push(occurrence);
            });

            endpointOccurrencesByLocation.forEach((groupedOccurrences) => {
              let detectionWithEndpointEvidence = JSON.parse(
                JSON.stringify(component)
              );
              detectionWithEndpointEvidence.evidence.occurrences = groupedOccurrences;
              detections.push(detectionWithEndpointEvidence);
            });
          } else {
            // The component has no occurence
            detections.push(component);
          }
        }
      });
      return detections;
    } else {
      return []; // The "components" array is either missing or not an array.
    }
  } catch (error) {
    console.error("Error parsing JSON:", error);
    model.addError(ErrorStatus.JsonParsing);
    return []; // An error occurred while parsing the JSON string.
  }
}
