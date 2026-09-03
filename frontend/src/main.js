import Vue from "vue";
import "@/styles/breachsafe-brand.css";
import App from "./App.vue";
import CarbonComponentsVue from "@carbon/vue/src/index";
import ChartsVue from "@carbon/charts-vue";
// eslint-disable-next-line no-unused-vars
import { model } from "@/model.js";
import { showResultFromUpload } from "@/helpers";

Vue.use(CarbonComponentsVue);
Vue.use(ChartsVue);
Vue.config.productionTip = false;
Vue.config.silent = true; // Removes ALL Vue warnings

new Vue({
  render: (h) => h(App),
  created() {
    // BQP: accept a CBOM pushed in from the host app (e.g. QuReddy Crypto Scan) and
    // render it exactly like an upload, so a scan auto-populates this viewer.
    window.addEventListener("message", (e) => {
      const d = e && e.data;
      if (d && d.type === "bqp-load-cbom" && d.cbom && d.cbom.components) {
        try {
          showResultFromUpload(d.cbom, d.name || "crypto-scan");
        } catch (err) {
          console.error("bqp-load-cbom failed", err);
        }
      }
    });
    // TODO: uncomment
    // window.onbeforeunload = function () {
    //   if (model.showResults) {
    //     console.log("User tried refreshing the page")
    //     return "Changes will be lost" // The custom message won't be displayed on modern browsers
    //   }
    // }
  },
}).$mount("#app");