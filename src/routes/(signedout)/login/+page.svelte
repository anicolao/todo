<script>
	console.log('(signedout)/login/+page.svelte');
	import { store } from '$lib/store';
	import Login from '$lib/components/Login.svelte';
	import Card, { Content as CardContent, Actions } from '@smui/card';
	import { goto } from '$app/navigation';

	$: if ($store.auth.signedIn) {
		goto('/');
	}
</script>

<div class="container">
	<Card class="login-card">
		<CardContent>
			<h2>TODOs</h2>
			<p>Welcome to Todo. Please sign in.</p>
		</CardContent>
		<Actions fullBleed>
			<Login />
		</Actions>
	</Card>
</div>

<style>
	.container {
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 16px;
		min-height: 80vh;
	}

	:global(.login-card) {
		width: 100%;
		max-width: 400px;
	}
</style>
