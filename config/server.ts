import cronTasks from "./cron-tasks"; // <--- Import the file
export default ({ env }) => ({
  host: env("HOST", "0.0.0.0"),
  port: env.int("PORT", 1337),
  cron: {
    enabled: true, // <--- Make sure this is true
    tasks: cronTasks, // <--- Pass the imported tasks here
  },
  app: {
    keys: env.array("APP_KEYS"),
  },
});
