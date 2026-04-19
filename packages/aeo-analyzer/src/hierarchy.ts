/**
 * AEO Analyzer -- Schema.org type hierarchy
 *
 * Single source of truth for parent/child relationships between schema.org
 * types. Used everywhere we check whether a page has a given schema type,
 * so that subtypes count as semantically matching parent types.
 *
 * Example: a page that declares @type "ProfessionalService" satisfies an
 * Organization check because the hierarchy is:
 *   Thing > Organization > LocalBusiness > ProfessionalService
 *
 * Source: https://schema.org/docs/full.html (April 2026).
 * Focused on types relevant to our checks. Unknown types (not listed here)
 * are treated as having no known ancestors aside from themselves.
 *
 * When you find a blind spot (a subtype we should have recognized), add it
 * here AND add a fixture in __tests__/hierarchy.test.ts so we never miss
 * the same subtype twice.
 */

// Direct-parent map. A type can have multiple parents (multiple inheritance
// is legal on schema.org, e.g. LocalBusiness is both Organization and Place).
const PARENTS: Record<string, string[]> = {
  // ===== Top of the tree =====
  Thing: [],

  // ===== Organization subtree =====
  Organization: ["Thing"],
  Airline: ["Organization"],
  Consortium: ["Organization"],
  Corporation: ["Organization"],
  EducationalOrganization: ["Organization"],
  CollegeOrUniversity: ["EducationalOrganization"],
  ElementarySchool: ["EducationalOrganization"],
  HighSchool: ["EducationalOrganization"],
  MiddleSchool: ["EducationalOrganization"],
  Preschool: ["EducationalOrganization"],
  School: ["EducationalOrganization"],
  FundingScheme: ["Organization"],
  GovernmentOrganization: ["Organization"],
  LibrarySystem: ["Organization"],
  MedicalOrganization: ["Organization"],
  DiagnosticLab: ["MedicalOrganization"],
  VeterinaryCare: ["MedicalOrganization"],
  NewsMediaOrganization: ["Organization"],
  NGO: ["Organization"],
  OnlineBusiness: ["Organization"],
  OnlineStore: ["OnlineBusiness"],
  PerformingGroup: ["Organization"],
  DanceGroup: ["PerformingGroup"],
  MusicGroup: ["PerformingGroup"],
  TheaterGroup: ["PerformingGroup"],
  PoliticalParty: ["Organization"],
  Project: ["Organization"],
  FundingAgency: ["Project"],
  ResearchProject: ["Project"],
  ResearchOrganization: ["Organization"],
  SearchRescueOrganization: ["Organization"],
  SportsOrganization: ["Organization"],
  SportsTeam: ["SportsOrganization"],
  WorkersUnion: ["Organization"],

  // ===== LocalBusiness and subtypes (dual parent: Organization + Place) =====
  LocalBusiness: ["Organization", "Place"],
  AnimalShelter: ["LocalBusiness"],
  ArchiveOrganization: ["LocalBusiness", "Organization"],
  AutomotiveBusiness: ["LocalBusiness"],
  AutoBodyShop: ["AutomotiveBusiness"],
  AutoDealer: ["AutomotiveBusiness"],
  AutoRental: ["AutomotiveBusiness"],
  AutoRepair: ["AutomotiveBusiness"],
  AutoWash: ["AutomotiveBusiness"],
  GasStation: ["AutomotiveBusiness"],
  MotorcycleDealer: ["AutomotiveBusiness"],
  MotorcycleRepair: ["AutomotiveBusiness"],
  ChildCare: ["LocalBusiness"],
  DryCleaningOrLaundry: ["LocalBusiness"],
  EmergencyService: ["LocalBusiness"],
  FireStation: ["EmergencyService", "CivicStructure"],
  Hospital: ["EmergencyService", "MedicalOrganization", "CivicStructure"],
  PoliceStation: ["EmergencyService", "CivicStructure"],
  EmploymentAgency: ["LocalBusiness"],
  EntertainmentBusiness: ["LocalBusiness"],
  AdultEntertainment: ["EntertainmentBusiness"],
  AmusementPark: ["EntertainmentBusiness"],
  ArtGallery: ["EntertainmentBusiness"],
  Casino: ["EntertainmentBusiness"],
  ComedyClub: ["EntertainmentBusiness"],
  MovieTheater: ["EntertainmentBusiness", "CivicStructure"],
  NightClub: ["EntertainmentBusiness"],
  FinancialService: ["LocalBusiness"],
  AccountingService: ["FinancialService"],
  AutomatedTeller: ["FinancialService"],
  BankOrCreditUnion: ["FinancialService"],
  InsuranceAgency: ["FinancialService"],
  FoodEstablishment: ["LocalBusiness"],
  Bakery: ["FoodEstablishment"],
  BarOrPub: ["FoodEstablishment"],
  Brewery: ["FoodEstablishment"],
  CafeOrCoffeeShop: ["FoodEstablishment"],
  Distillery: ["FoodEstablishment"],
  FastFoodRestaurant: ["FoodEstablishment"],
  IceCreamShop: ["FoodEstablishment"],
  Restaurant: ["FoodEstablishment"],
  Winery: ["FoodEstablishment"],
  GovernmentOffice: ["LocalBusiness"],
  PostOffice: ["GovernmentOffice"],
  HealthAndBeautyBusiness: ["LocalBusiness"],
  BeautySalon: ["HealthAndBeautyBusiness"],
  DaySpa: ["HealthAndBeautyBusiness"],
  HairSalon: ["HealthAndBeautyBusiness"],
  HealthClub: ["HealthAndBeautyBusiness", "SportsActivityLocation"],
  NailSalon: ["HealthAndBeautyBusiness"],
  TattooParlor: ["HealthAndBeautyBusiness"],
  HomeAndConstructionBusiness: ["LocalBusiness"],
  Electrician: ["HomeAndConstructionBusiness"],
  GeneralContractor: ["HomeAndConstructionBusiness"],
  HVACBusiness: ["HomeAndConstructionBusiness"],
  HousePainter: ["HomeAndConstructionBusiness"],
  Locksmith: ["HomeAndConstructionBusiness"],
  MovingCompany: ["HomeAndConstructionBusiness"],
  Plumber: ["HomeAndConstructionBusiness"],
  RoofingContractor: ["HomeAndConstructionBusiness"],
  InternetCafe: ["LocalBusiness"],
  LegalService: ["LocalBusiness"],
  Attorney: ["LegalService"],
  Notary: ["LegalService"],
  Library: ["LocalBusiness"],
  LodgingBusiness: ["LocalBusiness"],
  BedAndBreakfast: ["LodgingBusiness"],
  Campground: ["LodgingBusiness", "CivicStructure"],
  Hostel: ["LodgingBusiness"],
  Hotel: ["LodgingBusiness"],
  Motel: ["LodgingBusiness"],
  Resort: ["LodgingBusiness"],
  SkiResort: ["Resort"],
  VacationRental: ["LodgingBusiness"],
  MedicalBusiness: ["LocalBusiness"],
  CommunityHealth: ["MedicalBusiness"],
  Dentist: ["MedicalBusiness"],
  Dermatology: ["MedicalBusiness"],
  DietNutrition: ["MedicalBusiness"],
  Emergency: ["MedicalBusiness"],
  Geriatric: ["MedicalBusiness"],
  Gynecologic: ["MedicalBusiness"],
  MedicalClinic: ["MedicalBusiness", "MedicalOrganization"],
  Midwifery: ["MedicalBusiness"],
  Nursing: ["MedicalBusiness"],
  Obstetric: ["MedicalBusiness"],
  Oncologic: ["MedicalBusiness"],
  Optician: ["MedicalBusiness"],
  Optometric: ["MedicalBusiness"],
  Otolaryngologic: ["MedicalBusiness"],
  Pediatric: ["MedicalBusiness"],
  Pharmacy: ["MedicalBusiness", "MedicalOrganization"],
  Physician: ["MedicalBusiness", "MedicalOrganization"],
  PhysiciansOffice: ["Physician"],
  Physiotherapy: ["MedicalBusiness"],
  PlasticSurgery: ["MedicalBusiness"],
  Podiatric: ["MedicalBusiness"],
  PrimaryCare: ["MedicalBusiness"],
  Psychiatric: ["MedicalBusiness"],
  PublicHealth: ["MedicalBusiness"],
  ProfessionalService: ["LocalBusiness"],
  RadioStation: ["LocalBusiness"],
  RealEstateAgent: ["LocalBusiness"],
  RecyclingCenter: ["LocalBusiness"],
  SelfStorage: ["LocalBusiness"],
  ShoppingCenter: ["LocalBusiness"],
  SportsActivityLocation: ["LocalBusiness"],
  BowlingAlley: ["SportsActivityLocation"],
  ExerciseGym: ["SportsActivityLocation"],
  GolfCourse: ["SportsActivityLocation"],
  PublicSwimmingPool: ["SportsActivityLocation"],
  SportsClub: ["SportsActivityLocation"],
  StadiumOrArena: ["SportsActivityLocation", "CivicStructure"],
  TennisComplex: ["SportsActivityLocation"],
  Store: ["LocalBusiness"],
  AutoPartsStore: ["Store", "AutomotiveBusiness"],
  BikeStore: ["Store"],
  BookStore: ["Store"],
  ClothingStore: ["Store"],
  ComputerStore: ["Store"],
  ConvenienceStore: ["Store"],
  DepartmentStore: ["Store"],
  ElectronicsStore: ["Store"],
  Florist: ["Store"],
  FurnitureStore: ["Store"],
  GardenStore: ["Store"],
  GroceryStore: ["Store"],
  HardwareStore: ["Store"],
  HobbyShop: ["Store"],
  HomeGoodsStore: ["Store"],
  JewelryStore: ["Store"],
  LiquorStore: ["Store"],
  MensClothingStore: ["Store"],
  MobilePhoneStore: ["Store"],
  MovieRentalStore: ["Store"],
  MusicStore: ["Store"],
  OfficeEquipmentStore: ["Store"],
  OutletStore: ["Store"],
  PawnShop: ["Store"],
  PetStore: ["Store"],
  ShoeStore: ["Store"],
  SportingGoodsStore: ["Store"],
  TireShop: ["Store"],
  ToyStore: ["Store"],
  WholesaleStore: ["Store"],
  TelevisionStation: ["LocalBusiness"],
  TouristInformationCenter: ["LocalBusiness"],
  TravelAgency: ["LocalBusiness"],

  // ===== CreativeWork subtree (content types) =====
  CreativeWork: ["Thing"],
  Article: ["CreativeWork"],
  AdvertiserContentArticle: ["Article"],
  NewsArticle: ["Article"],
  AnalysisNewsArticle: ["NewsArticle"],
  AskPublicNewsArticle: ["NewsArticle"],
  BackgroundNewsArticle: ["NewsArticle"],
  OpinionNewsArticle: ["NewsArticle"],
  ReportageNewsArticle: ["NewsArticle"],
  ReviewNewsArticle: ["NewsArticle", "Review"],
  Report: ["Article"],
  SatiricalArticle: ["Article"],
  ScholarlyArticle: ["Article"],
  MedicalScholarlyArticle: ["ScholarlyArticle"],
  SocialMediaPosting: ["Article"],
  BlogPosting: ["SocialMediaPosting"],
  LiveBlogPosting: ["BlogPosting"],
  DiscussionForumPosting: ["SocialMediaPosting"],
  TechArticle: ["Article"],
  APIReference: ["TechArticle"],
  Blog: ["CreativeWork"],
  Book: ["CreativeWork"],
  Comment: ["CreativeWork"],
  Course: ["CreativeWork", "LearningResource"],
  LearningResource: ["CreativeWork"],
  HowTo: ["CreativeWork"],
  Recipe: ["HowTo"],
  HowToStep: ["ListItem", "CreativeWork"],
  Menu: ["CreativeWork"],
  MenuSection: ["CreativeWork"],
  MenuItem: ["Intangible"],
  Movie: ["CreativeWork"],
  MusicComposition: ["CreativeWork"],
  MusicRecording: ["CreativeWork"],
  PodcastEpisode: ["Episode"],
  PodcastSeries: ["CreativeWorkSeries"],
  CreativeWorkSeries: ["CreativeWork", "Series"],
  Series: ["Intangible"],
  Episode: ["CreativeWork"],
  Photograph: ["CreativeWork"],
  Question: ["Comment"],
  Answer: ["Comment"],
  Quotation: ["CreativeWork"],
  Review: ["CreativeWork"],
  ClaimReview: ["Review"],
  CriticReview: ["Review"],
  EmployerReview: ["Review"],
  MediaReview: ["Review"],
  Recommendation: ["Review"],
  UserReview: ["Review"],
  SoftwareApplication: ["CreativeWork"],
  MobileApplication: ["SoftwareApplication"],
  VideoGame: ["SoftwareApplication", "Game"],
  WebApplication: ["SoftwareApplication"],
  Game: ["CreativeWork"],
  VideoObject: ["MediaObject"],
  AudioObject: ["MediaObject"],
  ImageObject: ["MediaObject"],
  MediaObject: ["CreativeWork"],
  WebSite: ["CreativeWork"],
  WebPage: ["CreativeWork"],
  AboutPage: ["WebPage"],
  CheckoutPage: ["WebPage"],
  CollectionPage: ["WebPage"],
  ContactPage: ["WebPage"],
  FAQPage: ["WebPage"],
  ItemPage: ["WebPage"],
  MedicalWebPage: ["WebPage"],
  ProfilePage: ["WebPage"],
  QAPage: ["WebPage"],
  RealEstateListing: ["WebPage"],
  SearchResultsPage: ["WebPage"],
  WebPageElement: ["CreativeWork"],
  SiteNavigationElement: ["WebPageElement"],
  WPFooter: ["WebPageElement"],
  WPHeader: ["WebPageElement"],
  WPSideBar: ["WebPageElement"],

  // ===== Person subtree =====
  Person: ["Thing"],
  Patient: ["Person", "MedicalAudience"],

  // ===== Product subtree =====
  Product: ["Thing"],
  IndividualProduct: ["Product"],
  ProductCollection: ["Product"],
  ProductGroup: ["Product"],
  ProductModel: ["Product"],
  SomeProducts: ["Product"],
  Vehicle: ["Product"],
  Car: ["Vehicle"],
  Motorcycle: ["Vehicle"],

  // ===== Place subtree =====
  Place: ["Thing"],
  AdministrativeArea: ["Place"],
  City: ["AdministrativeArea"],
  Country: ["AdministrativeArea"],
  State: ["AdministrativeArea"],
  CivicStructure: ["Place"],
  Landform: ["Place"],
  LandmarksOrHistoricalBuildings: ["Place"],
  Residence: ["Place"],
  Accommodation: ["Place"],
  Apartment: ["Accommodation"],
  House: ["Accommodation"],
  Room: ["Accommodation"],
  TouristAttraction: ["Place"],
  TouristDestination: ["Place"],

  // ===== Event subtree =====
  Event: ["Thing"],
  BusinessEvent: ["Event"],
  ChildrensEvent: ["Event"],
  ComedyEvent: ["Event"],
  CourseInstance: ["Event"],
  DanceEvent: ["Event"],
  DeliveryEvent: ["Event"],
  EducationEvent: ["Event"],
  ExhibitionEvent: ["Event"],
  Festival: ["Event"],
  FoodEvent: ["Event"],
  Hackathon: ["Event"],
  LiteraryEvent: ["Event"],
  MusicEvent: ["Event"],
  PublicationEvent: ["Event"],
  SaleEvent: ["Event"],
  ScreeningEvent: ["Event"],
  SocialEvent: ["Event"],
  SportsEvent: ["Event"],
  TheaterEvent: ["Event"],
  UserInteraction: ["Event"],
  VisualArtsEvent: ["Event"],

  // ===== Intangibles we care about =====
  Intangible: ["Thing"],
  Rating: ["Intangible"],
  AggregateRating: ["Rating"],
  EndorsementRating: ["Rating"],
  ItemList: ["Intangible"],
  BreadcrumbList: ["ItemList"],
  ListItem: ["Intangible"],
  Offer: ["Intangible"],
  AggregateOffer: ["Offer"],
  OfferForLease: ["Offer"],
  OfferForPurchase: ["Offer"],
  Service: ["Intangible"],
  FinancialProduct: ["Service"],
  FoodService: ["Service"],
  GovernmentService: ["Service"],
  Audience: ["Intangible"],
  MedicalAudience: ["Audience", "PeopleAudience"],
  PeopleAudience: ["Audience"],
};

// Computed ancestor cache. Populated lazily via getAncestors().
const ancestorCache = new Map<string, Set<string>>();

/**
 * Normalize a raw @type string by stripping common prefixes ("schema:",
 * "https://schema.org/") and whitespace. Types on the web come in several
 * forms; this collapses them to bare type names.
 */
export function normalizeType(raw: string): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/^https?:\/\/schema\.org\//i, "")
    .replace(/^schema:/i, "")
    .trim();
}

/**
 * Return the set of ancestor types for a given type, including the type
 * itself. Walks parent pointers with BFS. Unknown types return just [type].
 */
export function getAncestors(type: string): string[] {
  const key = normalizeType(type);
  const cached = ancestorCache.get(key);
  if (cached) return Array.from(cached);

  const result = new Set<string>([key]);
  const queue: string[] = [key];
  while (queue.length) {
    const current = queue.shift()!;
    const parents = PARENTS[current];
    if (!parents) continue;
    for (const p of parents) {
      if (!result.has(p)) {
        result.add(p);
        queue.push(p);
      }
    }
  }
  ancestorCache.set(key, result);
  return Array.from(result);
}

/**
 * Check whether a given type is the target type or a subtype of it.
 */
export function isSubtypeOf(type: string, target: string): boolean {
  const targetNorm = normalizeType(target);
  return getAncestors(type).includes(targetNorm);
}

/**
 * Check whether any of the page's declared schema types are the target
 * or a subtype of the target. Replacement for flat array.includes() checks.
 *
 * Example:
 *   hasSchemaType(["ProfessionalService"], "Organization") === true
 *   hasSchemaType(["BlogPosting"], "Article") === true
 *   hasSchemaType(["FAQPage"], "WebPage") === true
 */
export function hasSchemaType(pageTypes: string[], target: string): boolean {
  if (!Array.isArray(pageTypes) || pageTypes.length === 0) return false;
  return pageTypes.some((t) => isSubtypeOf(t, target));
}

/**
 * Return the subset of page types that aren't in our hierarchy map. Used
 * for early-warning logging so we know when to extend the hierarchy.
 */
export function getUnknownTypes(pageTypes: string[]): string[] {
  const unknown: string[] = [];
  for (const raw of pageTypes) {
    const norm = normalizeType(raw);
    if (!norm) continue;
    if (norm === "Thing") continue;
    if (!(norm in PARENTS)) unknown.push(norm);
  }
  return unknown;
}

/**
 * Exposed so tests and callers can inspect the raw hierarchy map.
 */
export function getKnownTypes(): string[] {
  return Object.keys(PARENTS);
}
