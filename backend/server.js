const app = require("./src/app");
const { env } = require("./src/config/env");

app.listen(env.port, () => {
  console.log(`Node API running at http://localhost:${env.port}`);
  console.log(`Alfresco server: ${env.alfrescoHost}`);
});
