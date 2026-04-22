// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
// and what to do when importing types
declare namespace App {
	// interface Locals {}
	// interface Platform {}
	// interface PrivateEnv {}
	// interface PublicEnv {}
}

interface ImportMetaEnv {
	readonly VITE_APP_VERSION: string;
	readonly VITE_APP_COMMIT_HASH: string;
	readonly VITE_APP_DIRTY_FLAG: boolean;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
