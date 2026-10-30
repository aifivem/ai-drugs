name 'ai-drugs'
author 'TGIANN'
version '0.1.0'
license 'GPL-3.0-only'
description 'Drug corner selling and weed plants'
repository 'https://github.com/TGIANN/ai-drugs'
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
}
