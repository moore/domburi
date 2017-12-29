
.PHONY: htdocs

htdocs:
	mkdir -p htdocs
	cp src/js/*.js htdocs
	cp src/html/*.html htdocs

server: htdocs 
	cd htdocs && python -m SimpleHTTPServer 8000

