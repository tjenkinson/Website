$(document).ready(function() {

	$(".page-users-edit").first().each(function() {
	
		var $pageContainer = $(this).first();
		
		$pageContainer.find(".form-password").each(function() {

			var $container = $(this).first();
			var $componentDestinationEl = $container.parent().find('[name="password"]').first();
			var $componentToggledDestinationEl = $container.parent().find('[name="password-changed"]').first();
			var initialDataStr = $(this).attr("data-initialdata");
			var initialData = jQuery.parseJSON(initialDataStr);
			var toggleEnabled = $(this).attr("data-toggleenabled") === "1";
			
			var toggleableComponent = new ToggleableComponent(toggleEnabled, function(state) {
				return new SelectComponent(false, state);
			}, {
				value: ""
			}, initialData);
			$(toggleableComponent).on("stateChanged", function() {
				var state = toggleableComponent.getState();
				componentValue = state.componentState !== null ? state.componentState.value : "";
				$componentDestinationEl.val(componentValue);
				$componentToggledDestinationEl.val(state.componentToggled ? "1" : "0");
			});
			$container.append(toggleableComponent.getEl());
		});
		
		$pageContainer.find(".form-groups").each(function() {
			var $container = $(this).first();
			var $destinationEl = $container.parent().find('[name="groups"]').first();
			var initialDataStr = $(this).attr("data-initialdata");
			var initialData = jQuery.parseJSON(initialDataStr);
			
			var reordableList = new ReordableList(true, true, true, function(state) {
				return new AjaxSelect(baseUrl+"/admin/permissions/groupsajaxselect", state);
			}, {
				id: null,
				text: null
			}, initialData);
			$(reordableList).on("stateChanged", function() {
				$destinationEl.val(JSON.stringify(reordableList.getIds()));
			});
			$container.append(reordableList.getEl());
		});
	});
});