# Build mast distributable
./node_modules/rigging/bin/rigging.js lib/dependencies/socket.io.js lib/dependencies/jquery.min.js lib/dependencies/underscore.min.js lib/dependencies/underscore.string.min.js lib/dependencies/backbone.min.js lib/dependencies/json2.min.js lib/dependencies/logger.min.js lib/dependencies/outside.min.js lib/dependencies/pressFoo.js lib/mast.js lib/mixins.js lib/model.js lib/socket.js lib/pattern.js lib/events.js lib/component.js lib/tree.js lib/extend.js

# Copy it into the pwd
cp .rigging_out/rigging.min.js mast.min.js
