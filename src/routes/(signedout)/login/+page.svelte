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

<div>
	<Card>
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
	div {
		margin: 25%;
		margin-top: 5%;
	}
</style>
