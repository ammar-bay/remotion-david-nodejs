export interface Scene {
  video: string;
  audio: string;
  padding: number;
  duration: number;
}

export interface RequestBody {
  scenes: Scene[];
}
