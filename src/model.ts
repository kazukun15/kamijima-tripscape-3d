export type Verification='official_verified'|'multi_source_verified'|'coordinate_verified'|'approximate_area_only'|'pending'|'rejected';
export type Mode='walking'|'cycling'|'ferry';
export type Season='春'|'夏'|'秋'|'冬';
export interface Section {title:string;text:string;source_urls:string[];}
export interface Poi {
  id:string;name:string;name_kana:string;island:string;categories:string[];
  coordinates:{lat:number|null;lng:number|null};coordinate_source:string;coordinate_source_urls:string[];
  verification_status:Verification;confidence_score:number;last_verified_at:string;
  content_date:string|null;reference_date:string;location_scope:string;
  summary:string;description:string;deep_dive:Section[];
  best_season:string[];best_time:string[];related_topics:string[];related_people:string[];
  source_urls:string[];official_links:string[];related_pois:string[];warnings:string[];tags:string[];
  access:{note:string;port:string|null;port_source_url:string|null;official_url:string;checked_at:string;modes:Mode[]};
  hours:string|null;closed:string|null;fee:string|null;
}
export interface Island {id:string;name:string;kana:string;english:string;coordinates:[number,number];source_url:string;summary:string;official_url:string;zoom:number;search_terms?:string[];}
export interface Topic {id:string;name:string;kind:string;summary:string;source_urls:string[];related_topics:string[];}
export interface Context {island:string;season:Season;mode:Mode;hour:number;history:string[];categories:string[];}
