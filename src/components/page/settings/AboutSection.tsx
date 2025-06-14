import { ShieldCheck } from "lucide-solid";
import pkgJson from "../../../../package.json";

export default function AboutSection() {
  return (
    <div class="card bg-base-200 shadow-xl">
      <div class="card-body">
        <div class="flex justify-between items-center">
          <h2 class="card-title text-xl">
            <ShieldCheck class="w-6 h-6 mr-2 text-secondary" />
            About
          </h2>
          <span class="badge badge-outline badge-info">v{pkgJson.version}</span>
        </div>
        <p class="text-base-content/60 mt-2">
          A modern, powerful GUI for Scoop on Windows.
        </p>
      </div>
    </div>
  );
} 