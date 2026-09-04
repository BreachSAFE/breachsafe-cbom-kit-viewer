import { model } from "@/model.js";

export function getTitle() {
  return String(process.env.VUE_APP_TITLE || 'CBOM Service');
}

export function isViewerOnly() {
  return String(process.env.VUE_APP_VIEWER_ONLY) === "true";
}

export function isCompactLayout() {
  return new URLSearchParams(window.location.search).get("layout") === "compact";
}

export function getRequestedTheme() {
  const theme = new URLSearchParams(window.location.search).get("theme");
  return theme === "dark" || theme === "light" ? theme : null;
}

const URI_LOCATION_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

export function isEndpointOccurrence(occurrence) {
  if (!occurrence || typeof occurrence.location !== "string") {
    return false;
  }
  return URI_LOCATION_PATTERN.test(occurrence.location) &&
    !occurrence.location.toLowerCase().startsWith("file://");
}

export function isSourceCodeOccurrence(occurrence) {
  return Boolean(
    occurrence &&
    typeof occurrence.location === "string" &&
    !isEndpointOccurrence(occurrence) &&
    occurrence.line !== undefined &&
    occurrence.line !== null &&
    occurrence.line !== ""
  );
}

export function parseOccurrenceContext(occurrence) {
  if (!occurrence || typeof occurrence.additionalContext !== "string") {
    return {};
  }

  return occurrence.additionalContext.split(";").reduce((fields, token) => {
    const separator = token.indexOf("=");
    if (separator > 0) {
      const key = token.slice(0, separator).trim();
      if (key) {
        fields[key] = token.slice(separator + 1).trim();
      }
    }
    return fields;
  }, {});
}

const OBSERVATION_RANK = Object.freeze({
  no_response: 0,
  unknown: 1,
  rejected: 2,
  observed: 3,
  offered: 4,
  negotiated: 5,
});

export function selectPrimaryOccurrence(occurrences) {
  if (!Array.isArray(occurrences) || occurrences.length === 0) {
    return null;
  }

  return occurrences.reduce((primary, candidate) => {
    const primaryObservation = parseOccurrenceContext(primary).observation;
    const candidateObservation = parseOccurrenceContext(candidate).observation;
    const primaryRank = OBSERVATION_RANK[primaryObservation] ?? -1;
    const candidateRank = OBSERVATION_RANK[candidateObservation] ?? -1;
    return candidateRank > primaryRank ? candidate : primary;
  });
}

export function formatOccurrenceEvidenceSummary(occurrence) {
  const fields = parseOccurrenceContext(occurrence);
  const humanize = (value) => {
    const readable = value.replaceAll("_", " ");
    return readable.charAt(0).toUpperCase() + readable.slice(1);
  };

  const observation = fields.observation ? humanize(fields.observation) : "";
  let evidenceType = "";
  if (fields.evidence_type) {
    const words = fields.evidence_type.split(".");
    const scheme = typeof occurrence.location === "string"
      ? occurrence.location.split("://", 1)[0]
      : "";
    if (scheme && words[0].toLowerCase() === scheme.toLowerCase()) {
      words[0] = scheme.toUpperCase();
    }
    evidenceType = words.join(" ").replaceAll("_", " ");
  }
  return [observation, evidenceType].filter(Boolean).join(" · ");
}

export function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Format a big number using K for thousands and M for millions
export function numberFormatter(num) {
  if (Math.abs(num) > 999) {
    if (Math.abs(num) > 999999) {
      return Math.sign(num) * (Math.abs(num) / 1000000).toFixed(1) + "M";
    } else {
      return Math.sign(num) * (Math.abs(num) / 1000).toFixed(1) + "K";
    }
  } else {
    return Math.sign(num) * Math.abs(num);
  }
}

// Format a number in miliseconds to a human readable format like '7m 32s'
export function formatSeconds(seconds) {
  if (seconds < 0) {
    return "Invalid input";
  }

  // Calculate seconds and minutes
  let minutes = Math.floor(seconds / 60);

  // Format the result
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    // Prevent displaying a time of 0s
    if (seconds === 0) {
      return "1s";
    }
    return `${seconds}s`;
  }
}

export function openGitRepo(gitUrl) {
  window.open(gitUrl, "_blank", "noreferrer");
}

export function canOpenOnline() {
  let gitUrl = model.codeOrigin.gitUrl;
  let branch = model.codeOrigin.revision;
  let commitID = model.codeOrigin.commitID;

  if (gitUrl === undefined || gitUrl === null) {
    return false;
  }

  /* You need either the branch or (preferably) the commit ID to open the code online */
  if ((branch === undefined || branch === null) &&
      (commitID === undefined || commitID === null)) {
    return false;
  }

  return true;
}

// Returns the code link of a component.
// When specyfing a positive `numberOfLinesBeforeAfter`, you get a code link for the corresponding code block
export function getCodeLink(component, numberOfLinesBeforeAfter = 0) {
  if (!canOpenOnline()) {
    return;
  }

  let gitUrl = model.codeOrigin.gitUrl;
  let branch = model.codeOrigin.revision;
  let commitID = model.codeOrigin.commitID;

  const occurrences = component.evidence.occurrences;
  if (occurrences.length === 1) {
    const firstEntry = occurrences[0];
    const filePath = firstEntry.location;
    const lineNumber = firstEntry.line;

    // Check if commitID is present, otherwise use the branch
    const versionIdentifier = commitID ? commitID : branch;

    // Calculate the start and end lines using numberOfLinesBeforeAfter
    const startLine = Math.max(1, lineNumber - numberOfLinesBeforeAfter); // Ensure startLine is >= 1
    const endLine = lineNumber + numberOfLinesBeforeAfter;

    if (gitUrl.includes("github.com") || gitUrl.includes("gitlab.com")) {
      // For GitHub and GitLab, line ranges are specified with #Lstart-Lend
      return `${gitUrl}/blob/${versionIdentifier}/${filePath}#L${startLine}-L${endLine}`;
    } else if (gitUrl.includes("bitbucket.org")) {
      // For Bitbucket, line ranges are specified with #lines-start:end
      return `${gitUrl}/src/${versionIdentifier}/${filePath}#lines-${startLine}:${endLine}`;
    } else {
      return;
    }
  } else {
    console.error(
      "More than one context was found in the cryptoProperties of the component"
    );
    model.addError(""); // Displays an unknown error
  }
}

export function openOnline(component) {
  let codeUrl = getCodeLink(component)
  if (codeUrl) {
    window.open(codeUrl, "_blank", "noreferrer");
  }
}

export function limitString(str, limit) {
  if (str.length <= limit) {
    return str;
  }
  return str.slice(0, limit) + '...';
}
