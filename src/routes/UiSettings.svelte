<script>
	import { store } from '../store';
	import { backgroundUrlAction, uiSettings } from './UiSettings';

	/**
	 * @param {any} event
	 */
	function setBackground(event) {
		let imgUrl = event.srcElement.value;
    console.log("changed: " + imgUrl);

		// if(isValidUrl(imgUrl))
		store.dispatch(
			backgroundUrlAction({
				backgroundUrl: imgUrl
			})
		);
	}

</script>

<h3>Settings</h3>
<label for="url">Background image url:</label>
<input type="url" id="url" placeholder="image URL" on:input={setBackground} />
{#if $store.uiSettings.backgroundUrl}
  <img src="{$store.uiSettings.backgroundUrl}" alt="background for the app" />
{/if}

	https://images.unsplash.com/photo-1548164806-9709e698bfc8?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=707&q=80