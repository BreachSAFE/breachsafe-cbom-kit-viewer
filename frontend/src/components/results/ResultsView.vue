<template>
  <div>
    <ResultTitle class="result-title" />
    <DataTable class="data-table" />
  </div>
</template>

<script>
import { model } from "@/model.js";
import DataTable from "@/components/results/DataTable.vue";
import ResultTitle from "@/components/results/ResultTitle.vue";

export default {
  name: "ResultsView",
  components: {
    DataTable,
    ResultTitle,
  },
  data() {
    return {
      model,
    };
  },
};
</script>

<style scoped>
.loader-view {
  flex: 1;
  padding-left: 1%;
}
.result-title {
  padding: 0% 5% 3%;
}
.data-table {
  padding: 0% 5%;
  padding-bottom: 100px;
}
</style>
