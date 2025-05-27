const customCopyPlugin = {
  name: "copyPlugin",
  setup(build) {
    build.onEnd(() => {
      let fs = require("fs");
      let path = require("path");
      var fsExtra = require("fs-extra");

      const ops = [
        { from: "resources", to: "../resources" },
        { from: ".kushkirc", to: "../.kushkirc" },
        { from: "src/schema", to: "schema" },
        { from: "src/resources", to: "resources" },
        { from: ".kushki/schema", to: "schema/remote" },
      ];

      try {
        for (const iterator of ops) {
          const from = iterator.from;
          const to = path.join(
            path.dirname(build.initialOptions.outdir),
            iterator.to
          );

          if (!fs.existsSync(to)) {
            fsExtra.copySync(from, to);
          }
        }
      } catch (err) {
        console.log("File/directory copied");
        console.log(err);
      }
    });
  },
};

module.exports = [customCopyPlugin];
