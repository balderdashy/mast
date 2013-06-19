rm mast.dev.js
touch mast.dev.js

# Core dependencies
cat "lib/deps/$.js" >> mast.dev.js
echo '' >> mast.dev.js
cat "lib/deps/_.js" >> mast.dev.js
echo '' >> mast.dev.js
cat "lib/deps/Backbone.js" >> mast.dev.js
echo '' >> mast.dev.js
cat "lib/deps/async.js" >> mast.dev.js
echo '' >> mast.dev.js

# Core
cat "lib/mast.js" >> mast.dev.js
echo '' >> mast.dev.js
cat "lib/Util.js" >> mast.dev.js
echo '' >> mast.dev.js
cat "lib/touch.js" >> mast.dev.js
echo '' >> mast.dev.js
cat "lib/define.js" >> mast.dev.js
echo '' >> mast.dev.js
cat "lib/Component.js" >> mast.dev.js
echo '' >> mast.dev.js
cat "lib/Region.js" >> mast.dev.js
echo '' >> mast.dev.js
cat "lib/Data.js" >> mast.dev.js
echo '' >> mast.dev.js
cat "lib/Router.js" >> mast.dev.js
echo '' >> mast.dev.js
cat "lib/Comet.js" >> mast.dev.js
echo '' >> mast.dev.js
cat "lib/ready.js" >> mast.dev.js
echo '' >> mast.dev.js
cat "lib/raise.js" >> mast.dev.js
echo '' >> mast.dev.js

# Disable debug mode
echo 'Mast.debug = false;' >> mast.dev.js
echo '' >> mast.dev.js

# Copy into example
cp mast.dev.js example/assets/mast.dev.js

