<template>
  <div :class="{ 'compact-results': isCompactLayout }">
    <ResultTitle class="result-title" />
    <DataTable class="data-table" />
  </div>
</template>

<script>
import { model } from "@/model.js";
import DataTable from "@/components/results/DataTable.vue";
import ResultTitle from "@/components/results/ResultTitle.vue";
import { isCompactLayout } from "@/helpers.js";

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
  computed: {
    isCompactLayout,
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
.compact-results .data-table {
  padding-bottom: 1rem;
}
</style>
