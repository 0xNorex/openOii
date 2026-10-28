import "@testing-library/jest-dom";

// jsdom exposes requestSubmit() as a not-implemented stub in some versions.
// Override it deterministically so form-oriented tests stay warning-clean
// without changing production component behavior.
Object.defineProperty(HTMLFormElement.prototype, "requestSubmit", {
	configurable: true,
	value(this: HTMLFormElement, submitter?: HTMLElement) {
		if (submitter) {
			submitter.click();
			return;
		}
		this.dispatchEvent(
			new SubmitEvent("submit", { bubbles: true, cancelable: true }),
		);
	},
});

// jsdom has <dialog> but no showModal()/close() or Escape → cancel. Mirror the
// browser just enough for ui/Dialog.tsx: open attribute, cancel on Escape for
// the most recently opened modal, and a close event.
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
	const openModals: HTMLDialogElement[] = [];
	Object.assign(HTMLDialogElement.prototype, {
		showModal(this: HTMLDialogElement) {
			this.setAttribute("open", "");
			openModals.push(this);
		},
		close(this: HTMLDialogElement) {
			if (!this.hasAttribute("open")) return;
			this.removeAttribute("open");
			openModals.splice(openModals.indexOf(this), 1);
			this.dispatchEvent(new Event("close"));
		},
	});
	document.addEventListener("keydown", (event) => {
		// Like the browser: a handled keydown (preventDefault) is not a close request.
		if (event.key !== "Escape" || event.defaultPrevented) return;
		const top = openModals.filter((d) => d.isConnected).at(-1);
		if (top && top.dispatchEvent(new Event("cancel", { cancelable: true }))) top.close();
	});
}
