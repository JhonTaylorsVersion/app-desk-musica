type EventHandler = (...args: any[]) => void;

const eventHandlers = new Map<string, Set<EventHandler>>();

export function EventsOn(eventName: string, callback: EventHandler): void {
  const handlers = eventHandlers.get(eventName) ?? new Set<EventHandler>();
  handlers.add(callback);
  eventHandlers.set(eventName, handlers);
}

export function EventsOff(eventName: string): void {
  eventHandlers.delete(eventName);
}

export function emitCompatEvent(eventName: string, ...args: any[]): void {
  eventHandlers.get(eventName)?.forEach((handler) => handler(...args));
}

export function BrowserOpenURL(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function WindowMinimise(): void {}

export function WindowToggleMaximise(): void {}

export function Quit(): void {
  window.close();
}

export function OnFileDrop(callback: EventHandler): void {
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    callback(0, 0, []);
  });
}

export function OnFileDropOff(): void {}
