<template>
  <footer class="qureddy-footer" aria-label="QuReddy CBOM viewer footer">
    <span>QuReddy CBOM Viewer</span>
    <span aria-hidden="true">·</span>
    <a href="https://breachsafe.io" target="_blank" rel="noopener noreferrer">
      by BreachSAFE
    </a>
  </footer>
</template>

<script>
export default {
  name: "FooterView",
};
</script>

<style scoped>
.qureddy-footer {
  align-items: center;
  background: #161616;
  color: #f4f4f4;
  display: flex;
  font-size: 0.875rem;
  gap: 0.5rem;
  justify-content: center;
  min-height: 3rem;
  padding: 0.75rem 1rem;
}

.qureddy-footer a {
  color: #78dce8;
  text-decoration: none;
}

.qureddy-footer a:hover {
  text-decoration: underline;
}
</style>
