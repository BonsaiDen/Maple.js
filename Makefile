all: build/Client.js build/Server.js


CLIENT_FILES = lib/bison.js lib/Class.js lib/Twist.js Maple.js Client.js
build/Client.js: Makefile $(CLIENT_FILES)
	echo "Packaging Client..."
	@mkdir -p build
	@echo "" > build/Client.js
	@for i in $(CLIENT_FILES); do \
	   cat $$i >> build/Client.js; \
	   echo ";" >> build/Client.js; \
	done
	@echo "// Copyright (c) 2012 Ivo Wetzel. MIT License." > build/Client.min.js
	@uglifyjs --mangle-private -nc build/Client.js >> build/Client.min.js


SERVER_FILES=lib/bison.js lib/Class.js lib/WebSocket.js lib/ObjectList.js Maple.js Server.js
build/Server.js: Makefile $(SERVER_FILES)
	echo "Packaging Server..."
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
	   	echo '\n\n// ${file}----------------------------'; \
	   	echo '(function(module, exports) {\n'; \
	   	cat $${file}; \
	   	echo "})(modules['./$${file%.js}'], modules['./$${file%.js}'].exports);\n"; \
	done >> build/Server.js
	@echo "module.exports = modules['./Maple'].exports;" >> build/Server.js
	@echo "})(require);" >> build/Server.js
	@echo "// Copyright (c) 2012 Ivo Wetzel. MIT License." > build/Server.min.js
	@uglifyjs --mangle-private -nc build/Server.js >> build/Server.min.js


.PHONY: clean
clean:
	rm -rf build

