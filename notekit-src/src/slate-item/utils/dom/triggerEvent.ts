// Trigger a custom event
export const triggerEvent = (el: HTMLElement, eventName: string, detail?: any) => {
  const event = new CustomEvent(eventName, {
    detail,
    bubbles: true,
    cancelable: true
  });
  el.dispatchEvent(event);
}

