const { app } = require("./router");
require("./orders");

app.listen(Number(process.env.PORT || 8080), (port) => console.log("listening on " + port));
