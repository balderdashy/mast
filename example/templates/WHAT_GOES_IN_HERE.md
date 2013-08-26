In a production setting or with a distributed team, you'll want to use standard 
best practices for loading client-side templates.  

Our convention is a Grunt script which:

	(1) grabs templates from the `templates/` directory (this folder)
	(4) determines a template's `data-id` using its filename
	(3) precompiles all templates into a single JavaScript file
	(4) then loads them into the app with a Grunt plugin, so that 
		the client-side code ends up with something like:

		```
		Framework.templates = {
			someTemplateId	: precompiledTemplateFnFromFile,
			foo				: anotherPrecompiledTemplateFnFromFile
			/* ... and so on ... */
		}
		```