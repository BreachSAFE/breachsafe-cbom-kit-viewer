import Vue from "vue";
import "@/styles/breachsafe-brand.css";
import App from "./App.vue";
import CarbonComponentsVue from "@carbon/vue/src/index";
import ChartsVue from "@carbon/charts-vue";
// eslint-disable-next-line no-unused-vars
import { model } from "@/model.js";
import {
  MAX_CBOM_ARTIFACT_BYTES,
  showResultFromBytes,
  validateCbomFilename,
} from "@/helpers";

const EMBEDDED_CBOM_MESSAGE = "breachsafe.cbom.load.v1";
let embeddedLoadSequence = 0;

function decodeBase64(data) {
  if (
    typeof data !== "string" ||
    data.length === 0 ||
    data.length > Math.ceil(MAX_CBOM_ARTIFACT_BYTES / 3) * 4 ||
    data.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(data)
  ) {
    throw new Error("Invalid CBOM artifact base64 data");
  }
  const decoded = atob(data);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function loadEmbeddedCbom(message, sequence) {
  const artifact = message && message.artifact;
  if (
    !artifact ||
    artifact.mediaType !== "application/json" ||
    artifact.encoding !== "base64" ||
    !Number.isSafeInteger(artifact.byteLength) ||
    artifact.byteLength <= 0 ||
    artifact.byteLength > MAX_CBOM_ARTIFACT_BYTES ||
    typeof artifact.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(artifact.sha256)
  ) {
    throw new Error("Invalid CBOM artifact metadata");
  }
  const filename = validateCbomFilename(artifact.filename);
  const bytes = decodeBase64(artifact.data);
  if (bytes.byteLength !== artifact.byteLength) {
    throw new Error("CBOM artifact length mismatch");
  }
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0")
  ).join("");
  if (digest !== artifact.sha256) {
    throw new Error("CBOM artifact digest mismatch");
  }
  if (sequence === embeddedLoadSequence) {
    showResultFromBytes(bytes, filename);
  }
}

Vue.use(CarbonComponentsVue);
Vue.use(ChartsVue);
Vue.config.productionTip = false;
Vue.config.silent = true; // Removes ALL Vue warnings

new Vue({
  render: (h) => h(App),
  created() {
    window.addEventListener("message", (e) => {
      if (e.source !== window.parent || e.origin !== window.location.origin) return;
      const d = e && e.data;
      if (d && d.type === EMBEDDED_CBOM_MESSAGE) {
        const sequence = ++embeddedLoadSequence;
        model.startAgain();
        loadEmbeddedCbom(d, sequence).catch((error) => {
          console.error("Embedded CBOM load failed", error);
        });
      }
    });
    try {
      const _cbomRaw = new URLSearchParams(window.location.search).get('cbom');
      if (_cbomRaw && !_cbomRaw.includes('\\')) {
        const _u = new URL(_cbomRaw, location.origin);
        if (_u.origin === location.origin) {
          fetch(_u.href).then((response) => {
            if (!response.ok) throw new Error(`CBOM URL returned ${response.status}`);
            return response.arrayBuffer();
          }).then((bytes) => {
            showResultFromBytes(bytes, 'report.cdx.json');
          }).catch((e) => console.error('cbom url load failed', e));
        }
      }
    } catch (e) { console.error(e); }
    // TODO: uncomment
    // window.onbeforeunload = function () {
    //   if (model.showResults) {
    //     console.log("User tried refreshing the page")
    //     return "Changes will be lost" // The custom message won't be displayed on modern browsers
    //   }
    // }
  },
}).$mount("#app");
