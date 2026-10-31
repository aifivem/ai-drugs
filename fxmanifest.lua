name 'ai-drugs'
author 'TGIANN'
version '0.1.0' -- x-release-please-version
license 'GPL-3.0-only'
description 'Drug corner selling and weed plants'
repository 'https://github.com/aifivem/ai-drugs'
fx_version 'cerulean'
game 'gta5'
node_version '22'

client_script 'dist/client.js'
server_script 'dist/server.js'


dependencies {
	'/onesync',
	'ai-core',
}

files {
	'locales/*.json',
	'data/plants.json',
}
