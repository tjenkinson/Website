$(document).ready(function() {
	
	$("a[data-confirm]").click(function() {
		if (confirm($(this).attr("data-confirm"))) {
			pageProtect.disable();
			return true;
		}
		return false;
	});
	
});