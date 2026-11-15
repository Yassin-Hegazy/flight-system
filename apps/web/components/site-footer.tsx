export function SiteFooter() {
  return (
    <footer className="bg-navy print:hidden">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-5 py-6 md:flex-row md:items-center md:px-10 xl:min-h-[75px] xl:px-[75px] xl:py-0">
        <span className="text-[29px] leading-none font-extrabold text-white">aeron.</span>
        <span className="text-xs leading-none font-bold text-teal md:ml-[86px]">
          THE SKY IS NOT THE LIMIT.
        </span>
        <span className="text-[11px] leading-none font-bold text-mist md:ml-auto">
          GIU · SOFTWARE CONSTRUCTION AND TESTING
        </span>
      </div>
    </footer>
  );
}
