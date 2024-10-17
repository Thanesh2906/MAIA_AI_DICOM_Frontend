// Update the content of extensions/default/src/Panels/StudyBrowser/jspdf.ts
declare module 'jspdf' {
  export class jsPDF {
    constructor();
    text(text: string, x: number, y: number): void;
    save(filename: string): void;
    // Add other methods as needed
  }
}
