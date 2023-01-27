import { sveltekit } from '@sveltejs/kit/vite';
import execute from "rollup-plugin-shell";

/** @type {import('vite').UserConfig} */
const config = {
	plugins: [
		sveltekit(), 
		/*
		execute({ commands: ["./bin/version"], hook: "buildStart" }),
		execute({ commands: ["./bin/version"], hook: "handleHotUpdate" })
		*/
	],
	test: { include: ['tests/**/*.unit.ts'] }
};

export default config;
