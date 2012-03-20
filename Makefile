CLIENT_FILES = lib/bison.js lib/Class.js lib/Twist.js Maple.js Client.js
build/Client.js: $(CLIENT_FILES)
	@mkdir -p build
	@touch build/Client.js
	@for i in $(CLIENT_FILES); do \
	   cat $$i >> build/Client.js; \
	   echo ";" >> build/Client.js; \
	done
	@uglifyjs --mangle-private -nc build/Client.js > build/Client.min.js




.PHONY: build/Server.js
SERVER_FILES=lib/bison.js lib/Class.js lib/WebSocket.js lib/HashList.js Maple.js Server.js
build/Server.js: $(SERVER_FILES)
	@mkdir -p build
	@echo "(function(req) {" > build/Server.js
	@echo "var modules = {};" >> build/Server.js
	@for file in $(SERVER_FILES); do \
		echo "modules['./$${file%.js}'] = { exports: {} };" >> build/Server.js; \
	done
	@echo "function require(path) {" >> build/Server.js
	@echo "    if (modules[path]) {" >> build/Server.js
	@echo "	       return modules[path].exports;" >> build/Server.js 
	@echo "    }" >> build/Server.js
	@echo "    return req(path);" >> build/Server.js
	@echo "}" >> build/Server.js
	@for file in $(SERVER_FILES); do \
	   	echo '\n\n// ${file}----------------------------' >> build/Server.js; \
	   	echo '(function(module, exports) {\n' >> build/Server.js; \
	   	cat $${file} >> build/Server.js; \
	   	echo "})(modules['./$${file%.js}'], modules['./$${file%.js}'].exports);\n" >> build/Server.js; \
	done
	@echo "module.exports = modules['./Maple'];" >> build/Server.js
	@echo "})(require);" >> build/Server.js


.PHONY: clean
clean:
	rm -rf build

